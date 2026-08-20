// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

library SafeERC20 {
    error SafeERC20TransferFailed();
    error SafeERC20TransferFromFailed();

    // Handles both tokens that return bool and tokens that return nothing
    // (USDT-style): the call must not revert and, when it does return data,
    // the data must decode to true.
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, value)));
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert SafeERC20TransferFailed();
        }
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, value)));
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert SafeERC20TransferFromFailed();
        }
    }
}

contract Ownable {
    address private _owner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert OwnableUnauthorizedAccount(msg.sender);
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        if (newOwner == address(0)) revert OwnableInvalidOwner(newOwner);
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

contract ReentrancyGuard {
    bool private _entered;

    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        if (_entered) revert ReentrancyGuardReentrantCall();
        _entered = true;
        _;
        _entered = false;
    }
}

/// @title ArcBridgeEscrow
/// @notice USDC escrow with a client → freelancer lifecycle plus a client
///         refund path, an expiry timelock, and on-chain arbitration.
/// @dev State machine:
///         created → funded → workSubmitted → approved → released
///         funded (expired, no work)      → cancelEscrow → refunded
///         funded + workSubmitted + expired + !approved → claimAfterExpiry → released
///         approved (released by client or freelancer)  → released
///         funded → disputeEscrow → resolveDispute → released | refunded
///      The expiry timelock starts when funds are deposited, so a freelancer
///      always gets the full duration to submit work after the client funds.
contract ArcBridgeEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error InvalidUSDC();
    error InvalidFreelancer();
    error InvalidAmount();
    error NotClient();
    error NotFreelancer();
    error NotParticipant();
    error NotFunded();
    error NotSubmitted();
    error NotApproved();
    error NotArbitrator();
    error InvalidArbitrator();
    error AlreadyFunded();
    error AlreadySubmitted();
    error AlreadyApproved();
    error AlreadyReleased();
    error AlreadyRefunded();
    error AlreadyDisputed();
    error NotDisputed();
    error NotExpired();
    error EscrowExpired();
    error CannotCancel();
    error CannotClaim();
    error RescueZeroAddress();
    error NothingToRescue();
    error EscrowCapExceeded();
    error TimelockPending();
    error NotApprovedClaim();

    /// @notice How long an arbitrator change must wait before it is active.
    uint256 public constant ARBITRATOR_CHANGE_DELAY = 2 days;

    struct Escrow {
        address client;
        address freelancer;
        uint256 amount;
        bool funded;
        bool workSubmitted;
        bool approved;
        bool released;
        bool refunded;
        bool disputed;
        uint256 createdAt;
        uint256 expiresAt;
    }

    IERC20 public immutable usdc;
    uint256 public escrowCount;
    uint256 public defaultDuration;
    uint256 public maxEscrowsPerClient;
    address public arbitrator;
    // Two-step arbitrator change: setArbitrator schedules pendingArbitrator and
    // a deadline; confirmArbitrator makes it active after the delay elapses.
    // Guards against the owner swapping the arbitrator mid-dispute to control
    // an outcome. Zero deadline means no change is pending.
    address public pendingArbitrator;
    uint256 public arbitratorChangeDeadline;
    // Sum of amounts locked in funded, unreleased escrows. Kept in sync so the
    // owner can rescue accidentally-sent tokens without ever touching client
    // funds, and so rescueTokens never needs an O(n) loop over escrows.
    uint256 public lockedBalance;
    mapping(uint256 => Escrow) public escrows;
    // Expiry duration (seconds) chosen at creation; the actual expiresAt is
    // computed when funds are deposited, so the clock starts at funding.
    mapping(uint256 => uint256) public escrowDurations;
    mapping(address => uint256) public clientEscrowCount;

    event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount);
    event FundsDeposited(uint256 indexed escrowId, uint256 amount);
    event WorkSubmitted(uint256 indexed escrowId);
    event WorkApproved(uint256 indexed escrowId);
    event FundsReleased(uint256 indexed escrowId, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId);
    event DisputeResolved(uint256 indexed escrowId, bool favorFreelancer, uint256 amount);
    event TokensRescued(address indexed token, address indexed recipient, uint256 amount);
    event MaxEscrowsPerClientUpdated(uint256 maxEscrows);
    event ArbitratorChangeScheduled(address indexed newArbitrator);
    event ArbitratorChanged(address indexed newArbitrator);
    event DefaultDurationChanged(uint256 newDuration);

    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidUSDC();
        usdc = IERC20(_usdc);
        arbitrator = msg.sender;
        defaultDuration = 7 days;
        maxEscrowsPerClient = 50;
    }

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert NotArbitrator();
        _;
    }

    /// @notice Schedule an arbitrator change. The new arbitrator becomes active
    ///         only after confirmArbitrator is called once ARBITRATOR_CHANGE_DELAY
    ///         has elapsed, so the owner cannot swap the arbitrator mid-dispute
    ///         to control an outcome. Owner only.
    /// @dev Calling again reschedules: the previously pending change is
    ///      replaced and the deadline is pushed out.
    function setArbitrator(address _arbitrator) external onlyOwner {
        if (_arbitrator == address(0)) revert InvalidArbitrator();
        pendingArbitrator = _arbitrator;
        arbitratorChangeDeadline = block.timestamp + ARBITRATOR_CHANGE_DELAY;
        emit ArbitratorChangeScheduled(_arbitrator);
    }

    /// @notice Confirm a pending arbitrator change after the delay elapsed.
    ///         No-op (returns the current arbitrator) when nothing is pending.
    function confirmArbitrator() external returns (address) {
        if (arbitratorChangeDeadline == 0) return arbitrator;
        if (block.timestamp < arbitratorChangeDeadline) revert TimelockPending();
        address newArbitrator = pendingArbitrator;
        arbitrator = newArbitrator;
        delete pendingArbitrator;
        arbitratorChangeDeadline = 0;
        emit ArbitratorChanged(newArbitrator);
        return newArbitrator;
    }

    /// @notice Cancel a pending arbitrator change. Owner only.
    function cancelArbitratorChange() external onlyOwner {
        delete pendingArbitrator;
        arbitratorChangeDeadline = 0;
    }

    /// @notice Set the default expiry duration for new escrows. Owner only.
    function setDefaultDuration(uint256 _duration) external onlyOwner {
        if (_duration == 0) revert InvalidAmount();
        defaultDuration = _duration;
        emit DefaultDurationChanged(_duration);
    }

    /// @notice Set how many escrows a single wallet may create (spam cap).
    ///         Owner only. Counts every escrow ever created by the wallet.
    function setMaxEscrowsPerClient(uint256 _max) external onlyOwner {
        if (_max == 0) revert InvalidAmount();
        maxEscrowsPerClient = _max;
        emit MaxEscrowsPerClientUpdated(_max);
    }

    /// @notice Recover tokens sent directly to the contract by mistake. For
    ///         the escrow token (USDC), only the amount *above* what open
    ///         escrows lock can be rescued, so client funds are never at risk.
    ///         Other tokens are rescued in full. Owner only.
    function rescueTokens(IERC20 token, address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert RescueZeroAddress();
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NothingToRescue();

        uint256 amount = balance;
        if (address(token) == address(usdc)) {
            if (balance <= lockedBalance) revert NothingToRescue();
            amount = balance - lockedBalance;
        }

        token.safeTransfer(recipient, amount);
        emit TokensRescued(address(token), recipient, amount);
    }

    /// @notice Create an escrow with the configured default duration.
    function createEscrow(address f, uint256 a) external returns (uint256) {
        return createEscrowWithDeadline(f, a, defaultDuration);
    }

    /// @notice Create an escrow with a custom expiry duration in seconds. The
    ///         expiry clock starts when the client deposits funds, so a client
    ///         can never fund at the last moment and leave the freelancer no
    ///         time to submit work.
    function createEscrowWithDeadline(address f, uint256 a, uint256 duration) public returns (uint256) {
        if (f == address(0)) revert InvalidFreelancer();
        if (a == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidAmount();

        uint256 clientCount = clientEscrowCount[msg.sender] + 1;
        if (clientCount > maxEscrowsPerClient) revert EscrowCapExceeded();
        clientEscrowCount[msg.sender] = clientCount;

        escrowCount++;
        uint256 id = escrowCount;
        escrows[id] = Escrow({
            client: msg.sender,
            freelancer: f,
            amount: a,
            funded: false,
            workSubmitted: false,
            approved: false,
            released: false,
            refunded: false,
            disputed: false,
            createdAt: block.timestamp,
            expiresAt: 0
        });
        escrowDurations[id] = duration;
        emit EscrowCreated(id, msg.sender, f, a);
        return id;
    }

    /// @notice Client locks the escrow amount into the contract. The expiry
    ///         clock starts here (expiresAt is set at funding), so the
    ///         freelancer always has the full duration to submit work.
    function depositFunds(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender) revert NotClient();
        if (e.funded) revert AlreadyFunded();
        if (e.refunded) revert AlreadyRefunded();
        if (e.disputed) revert AlreadyDisputed();
        uint256 duration = escrowDurations[id];
        if (duration == 0) revert EscrowExpired();
        usdc.safeTransferFrom(msg.sender, address(this), e.amount);
        e.funded = true;
        e.expiresAt = block.timestamp + duration;
        lockedBalance += e.amount;
        emit FundsDeposited(id, e.amount);
    }

    /// @notice Freelancer marks the work as delivered.
    function submitWork(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.freelancer != msg.sender) revert NotFreelancer();
        if (!e.funded) revert NotFunded();
        if (e.workSubmitted) revert AlreadySubmitted();
        if (e.disputed) revert AlreadyDisputed();
        if (e.released || e.refunded) revert AlreadyReleased();
        if (_expired(e)) revert EscrowExpired();
        e.workSubmitted = true;
        emit WorkSubmitted(id);
    }

    /// @notice Client confirms the work is satisfactory.
    function approveWork(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender) revert NotClient();
        if (!e.workSubmitted) revert NotSubmitted();
        if (e.approved) revert AlreadyApproved();
        if (e.disputed) revert AlreadyDisputed();
        if (e.released || e.refunded) revert AlreadyReleased();
        e.approved = true;
        emit WorkApproved(id);
    }

    /// @notice Release the funds to the freelancer. The client releases after
    ///         approving; once approved, the freelancer can also release so a
    ///         stalling client cannot freeze payment indefinitely.
    function releaseFunds(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender && e.freelancer != msg.sender) revert NotParticipant();
        if (!e.approved) revert NotApproved();
        if (e.released) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        e.released = true;
        lockedBalance -= e.amount;
        usdc.safeTransfer(e.freelancer, e.amount);
        _decrementCap(e.client);
        emit FundsReleased(id, e.amount);
    }

    /// @notice Client cancels the escrow. Unfunded escrows cancel any time;
    ///         funded ones only after expiry and before work is submitted, in
    ///         which case the deposit is refunded to the client.
    function cancelEscrow(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender) revert NotClient();
        if (e.released || e.refunded) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        if (e.approved) revert CannotCancel();

        if (e.funded) {
            if (!_expired(e)) revert NotExpired();
            // Once work is submitted, the freelancer owns the claim path.
            if (e.workSubmitted) revert CannotCancel();
        }

        uint256 refund = e.funded ? e.amount : 0;
        e.refunded = true;
        _decrementCap(e.client);
        if (refund > 0) {
            lockedBalance -= e.amount;
            usdc.safeTransfer(e.client, refund);
        }
        emit EscrowCancelled(id, refund);
    }

    /// @notice After expiry, the freelancer can claim the locked funds when work
    ///         was submitted and the client never approved or released them.
    ///         Once the client has approved, the freelancer's path is
    ///         releaseFunds (callable by the freelancer) — not a unilateral
    ///         claim past the timelock.
    function claimAfterExpiry(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.freelancer != msg.sender) revert NotFreelancer();
        if (!e.funded) revert NotFunded();
        if (!e.workSubmitted) revert NotSubmitted();
        if (e.released || e.refunded) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        if (e.approved) revert NotApprovedClaim();
        if (!_expired(e)) revert NotExpired();
        e.released = true;
        lockedBalance -= e.amount;
        usdc.safeTransfer(e.freelancer, e.amount);
        _decrementCap(e.client);
        emit FundsReleased(id, e.amount);
    }

    /// @notice Either party can raise a dispute while funds are locked.
    function disputeEscrow(uint256 id) external {
        Escrow storage e = escrows[id];
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParticipant();
        if (!e.funded) revert NotFunded();
        if (e.released || e.refunded) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        e.disputed = true;
        emit DisputeRaised(id);
    }

    /// @notice Arbitrator resolves a dispute: favorFreelancer pays the
    ///         freelancer, otherwise the client is refunded.
    function resolveDispute(uint256 id, bool favorFreelancer) external onlyArbitrator nonReentrant {
        Escrow storage e = escrows[id];
        if (!e.disputed) revert NotDisputed();
        if (e.released || e.refunded) revert AlreadyReleased();

        e.disputed = false;
        lockedBalance -= e.amount;
        if (favorFreelancer) {
            e.released = true;
            usdc.safeTransfer(e.freelancer, e.amount);
        } else {
            e.refunded = true;
            usdc.safeTransfer(e.client, e.amount);
        }
        _decrementCap(e.client);
        emit DisputeResolved(id, favorFreelancer, e.amount);
    }

    /// @notice Release a closed escrow's slot in the client's cap so the cap
    ///         limits simultaneous open escrows instead of a lifetime count.
    function _decrementCap(address client) internal {
        uint256 count = clientEscrowCount[client];
        if (count > 0) clientEscrowCount[client] = count - 1;
    }

    function _expired(Escrow storage e) internal view returns (bool) {
        return block.timestamp >= e.expiresAt;
    }
}
