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

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        bool success = token.transfer(to, value);
        if (!success) revert SafeERC20TransferFailed();
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        bool success = token.transferFrom(from, to, value);
        if (!success) revert SafeERC20TransferFromFailed();
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
///         funded + workSubmitted (expired) → claimAfterExpiry → released
///         funded → disputeEscrow → resolveDispute → released | refunded
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
    address public arbitrator;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount);
    event FundsDeposited(uint256 indexed escrowId, uint256 amount);
    event WorkSubmitted(uint256 indexed escrowId);
    event WorkApproved(uint256 indexed escrowId);
    event FundsReleased(uint256 indexed escrowId, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId);
    event DisputeResolved(uint256 indexed escrowId, bool favorFreelancer, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidUSDC();
        usdc = IERC20(_usdc);
        arbitrator = msg.sender;
        defaultDuration = 7 days;
    }

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert NotArbitrator();
        _;
    }

    /// @notice Set who may resolve disputes. Owner only.
    function setArbitrator(address _arbitrator) external onlyOwner {
        if (_arbitrator == address(0)) revert InvalidArbitrator();
        arbitrator = _arbitrator;
    }

    /// @notice Set the default expiry duration for new escrows. Owner only.
    function setDefaultDuration(uint256 _duration) external onlyOwner {
        if (_duration == 0) revert InvalidAmount();
        defaultDuration = _duration;
    }

    /// @notice Create an escrow with the configured default duration.
    function createEscrow(address f, uint256 a) external returns (uint256) {
        return createEscrowWithDeadline(f, a, defaultDuration);
    }

    /// @notice Create an escrow with a custom expiry duration in seconds.
    function createEscrowWithDeadline(address f, uint256 a, uint256 duration) public returns (uint256) {
        if (f == address(0)) revert InvalidFreelancer();
        if (a == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidAmount();

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
            expiresAt: block.timestamp + duration
        });
        emit EscrowCreated(id, msg.sender, f, a);
        return id;
    }

    /// @notice Client locks the escrow amount into the contract.
    function depositFunds(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender) revert NotClient();
        if (e.funded) revert AlreadyFunded();
        if (e.refunded) revert AlreadyRefunded();
        if (e.disputed) revert AlreadyDisputed();
        if (_expired(e)) revert EscrowExpired();
        usdc.safeTransferFrom(msg.sender, address(this), e.amount);
        e.funded = true;
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

    /// @notice Client releases the funds to the freelancer after approval.
    function releaseFunds(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.client != msg.sender) revert NotClient();
        if (!e.approved) revert NotApproved();
        if (e.released) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        e.released = true;
        usdc.safeTransfer(e.freelancer, e.amount);
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
        if (refund > 0) {
            usdc.safeTransfer(e.client, refund);
        }
        emit EscrowCancelled(id, refund);
    }

    /// @notice After expiry, the freelancer can claim the locked funds once work
    ///         was submitted and the client never approved/released them.
    function claimAfterExpiry(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.freelancer != msg.sender) revert NotFreelancer();
        if (!e.funded) revert NotFunded();
        if (!e.workSubmitted) revert NotSubmitted();
        if (e.released || e.refunded) revert AlreadyReleased();
        if (e.disputed) revert AlreadyDisputed();
        if (!_expired(e)) revert NotExpired();
        e.released = true;
        usdc.safeTransfer(e.freelancer, e.amount);
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
        if (favorFreelancer) {
            e.released = true;
            usdc.safeTransfer(e.freelancer, e.amount);
        } else {
            e.refunded = true;
            usdc.safeTransfer(e.client, e.amount);
        }
        emit DisputeResolved(id, favorFreelancer, e.amount);
    }

    function _expired(Escrow storage e) internal view returns (bool) {
        return block.timestamp >= e.expiresAt;
    }
}
