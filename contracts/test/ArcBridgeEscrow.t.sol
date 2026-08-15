// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcBridgeEscrow} from "../src/ArcBridgeEscrow.sol";
// Plain import so file-scope helpers (IERC20) used by the contract are in scope
// for casts in tests.
import "../src/ArcBridgeEscrow.sol";

/// @notice Minimal ERC-20 stand-in for USDC (6 decimals, mintable).
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "USDC: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "USDC: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract ArcBridgeEscrowTest is Test {
    ArcBridgeEscrow public escrow;
    MockUSDC public usdc;

    address client = makeAddr("client");
    address freelancer = makeAddr("freelancer");
    address other = makeAddr("other");
    address arbitrator = makeAddr("arbitrator");

    uint256 constant AMOUNT = 100e6; // 100 USDC

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new ArcBridgeEscrow(address(usdc));
        escrow.setArbitrator(arbitrator);
        usdc.mint(client, 1_000_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // Public mapping getters return tuples, so read fields via destructuring.
    // Order: client, freelancer, amount, funded, workSubmitted, approved,
    //        released, refunded, disputed, createdAt, expiresAt.
    function _fields(uint256 id)
        internal
        view
        returns (
            address _client,
            address _freelancer,
            uint256 _amount,
            bool _funded,
            bool _submitted,
            bool _approved,
            bool _released,
            bool _refunded,
            bool _disputed,
            uint256 _createdAt,
            uint256 _expiresAt
        )
    {
        (
            _client,
            _freelancer,
            _amount,
            _funded,
            _submitted,
            _approved,
            _released,
            _refunded,
            _disputed,
            _createdAt,
            _expiresAt
        ) = escrow.escrows(id);
    }

    // ---------------- helpers ----------------

    function _create(uint256 amount) internal returns (uint256) {
        vm.prank(client);
        return escrow.createEscrow(freelancer, amount);
    }

    function _createWithDeadline(uint256 amount, uint256 duration) internal returns (uint256) {
        vm.prank(client);
        return escrow.createEscrowWithDeadline(freelancer, amount, duration);
    }

    function _createAndFund(uint256 amount) internal returns (uint256) {
        uint256 id = _create(amount);
        vm.prank(client);
        escrow.depositFunds(id);
        return id;
    }

    function _fundedSubmitted(uint256 amount) internal returns (uint256) {
        uint256 id = _createAndFund(amount);
        vm.prank(freelancer);
        escrow.submitWork(id);
        return id;
    }

    function _fundedSubmittedApproved(uint256 amount) internal returns (uint256) {
        uint256 id = _fundedSubmitted(amount);
        vm.prank(client);
        escrow.approveWork(id);
        return id;
    }

    function _warpToExpiry(uint256 id) internal {
        (,,,,,,,,,, uint256 _expiresAt) = _fields(id);
        vm.warp(_expiresAt);
    }

    // ---------------- creation ----------------

    function test_CreateEscrow_SetsFields() public {
        uint256 id = _create(AMOUNT);

        (
            address _c,
            address _f,
            uint256 _amountValue,
            bool _funded,
            bool _submitted,
            bool _approved,
            bool _released,
            bool _refunded,
            bool _disputed,
            uint256 _createdAt,
            uint256 _expiresAt
        ) = _fields(id);
        assertEq(_c, client);
        assertEq(_f, freelancer);
        assertEq(_amountValue, AMOUNT);
        assertFalse(_funded);
        assertFalse(_submitted);
        assertFalse(_approved);
        assertFalse(_released);
        assertFalse(_refunded);
        assertFalse(_disputed);
        assertEq(_createdAt, block.timestamp);
        assertEq(_expiresAt, block.timestamp + 7 days);
        assertEq(escrow.escrowCount(), 1);
    }

    function test_CreateEscrow_RevertsInvalidFreelancer() public {
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.InvalidFreelancer.selector);
        escrow.createEscrow(address(0), AMOUNT);
    }

    function test_CreateEscrow_RevertsZeroAmount() public {
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.InvalidAmount.selector);
        escrow.createEscrow(freelancer, 0);
    }

    function test_CreateEscrowWithDeadline_SetsCustomExpiry() public {
        uint256 id = _createWithDeadline(AMOUNT, 1 days);

        (,,,,,,,,,, uint256 _expiresAt) = _fields(id);
        assertEq(_expiresAt, block.timestamp + 1 days);
    }

    function test_CreateEscrowWithDeadline_RevertsZeroDuration() public {
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.InvalidAmount.selector);
        escrow.createEscrowWithDeadline(freelancer, AMOUNT, 0);
    }

    // ---------------- happy-path lifecycle ----------------

    function test_FullLifecycle_PaysFreelancer() public {
        uint256 id = _create(AMOUNT);

        vm.prank(client);
        escrow.depositFunds(id);
        (,,, bool _funded,,,,,,,) = _fields(id);
        assertTrue(_funded);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        vm.prank(freelancer);
        escrow.submitWork(id);
        (,,,, bool _submitted,,,,,,) = _fields(id);
        assertTrue(_submitted);

        vm.prank(client);
        escrow.approveWork(id);
        (,,,,, bool _approved,,,,,) = _fields(id);
        assertTrue(_approved);

        uint256 freelancerBefore = usdc.balanceOf(freelancer);
        vm.prank(client);
        escrow.releaseFunds(id);

        (,,,,,, bool _released,,,,) = _fields(id);
        assertTrue(_released);
        assertEq(usdc.balanceOf(freelancer), freelancerBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ---------------- deposit ----------------

    function test_Deposit_RevertsNonClient() public {
        uint256 id = _create(AMOUNT);
        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotClient.selector);
        escrow.depositFunds(id);
    }

    function test_Deposit_RevertsDouble() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyFunded.selector);
        escrow.depositFunds(id);
    }

    function test_Deposit_RevertsAfterExpiry() public {
        uint256 id = _create(AMOUNT);
        _warpToExpiry(id);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.EscrowExpired.selector);
        escrow.depositFunds(id);
    }

    // ---------------- submit / approve / release guards ----------------

    function test_Submit_RevertsNonFreelancer() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotFreelancer.selector);
        escrow.submitWork(id);
    }

    function test_Submit_RevertsUnfunded() public {
        uint256 id = _create(AMOUNT);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.NotFunded.selector);
        escrow.submitWork(id);
    }

    function test_Submit_RevertsDouble() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.AlreadySubmitted.selector);
        escrow.submitWork(id);
    }

    function test_Submit_RevertsAfterExpiry() public {
        uint256 id = _createAndFund(AMOUNT);
        _warpToExpiry(id);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.EscrowExpired.selector);
        escrow.submitWork(id);
    }

    function test_Approve_RevertsBeforeSubmit() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.NotSubmitted.selector);
        escrow.approveWork(id);
    }

    function test_Approve_RevertsDouble() public {
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyApproved.selector);
        escrow.approveWork(id);
    }

    function test_Release_RevertsBeforeApproval() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.NotApproved.selector);
        escrow.releaseFunds(id);
    }

    function test_Release_RevertsDouble() public {
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        vm.prank(client);
        escrow.releaseFunds(id);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyReleased.selector);
        escrow.releaseFunds(id);
    }

    // ---------------- cancelEscrow (client refund) ----------------

    function test_Cancel_UnfundedEscrow() public {
        uint256 id = _create(AMOUNT);
        vm.prank(client);
        escrow.cancelEscrow(id);

        (,,,,,,, bool _refunded,,,) = _fields(id);
        assertTrue(_refunded);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(client), 1_000_000e6); // nothing moved
    }

    function test_Cancel_RevertsNonClient() public {
        uint256 id = _create(AMOUNT);
        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotClient.selector);
        escrow.cancelEscrow(id);
    }

    function test_Cancel_Funded_BeforeExpiry_Reverts() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.NotExpired.selector);
        escrow.cancelEscrow(id);
    }

    function test_Cancel_Funded_AfterExpiry_RefundsClient() public {
        uint256 id = _createAndFund(AMOUNT);
        _warpToExpiry(id);

        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(client);
        escrow.cancelEscrow(id);

        (,,,,,,, bool _refunded,,,) = _fields(id);
        assertTrue(_refunded);
        assertEq(usdc.balanceOf(client), clientBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Cancel_RevertsAfterWorkSubmitted() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        _warpToExpiry(id);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.CannotCancel.selector);
        escrow.cancelEscrow(id);
    }

    function test_Cancel_RevertsAfterApproval() public {
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.CannotCancel.selector);
        escrow.cancelEscrow(id);
    }

    function test_Cancel_RevertsDouble() public {
        uint256 id = _create(AMOUNT);
        vm.prank(client);
        escrow.cancelEscrow(id);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyReleased.selector);
        escrow.cancelEscrow(id);
    }

    // ---------------- claimAfterExpiry (freelancer protection) ----------------

    function test_ClaimAfterExpiry_RevertsBeforeExpiry() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.NotExpired.selector);
        escrow.claimAfterExpiry(id);
    }

    function test_ClaimAfterExpiry_RevertsBeforeSubmit() public {
        uint256 id = _createAndFund(AMOUNT);
        _warpToExpiry(id);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.NotSubmitted.selector);
        escrow.claimAfterExpiry(id);
    }

    function test_ClaimAfterExpiry_RevertsNonFreelancer() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        _warpToExpiry(id);
        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotFreelancer.selector);
        escrow.claimAfterExpiry(id);
    }

    function test_ClaimAfterExpiry_PaysFreelancer() public {
        uint256 id = _fundedSubmitted(AMOUNT);
        _warpToExpiry(id);

        uint256 freelancerBefore = usdc.balanceOf(freelancer);
        vm.prank(freelancer);
        escrow.claimAfterExpiry(id);

        (,,,,,, bool _released,,,,) = _fields(id);
        assertTrue(_released);
        assertEq(usdc.balanceOf(freelancer), freelancerBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ClaimAfterExpiry_WorksAfterApproval() public {
        // Client approved but never released: freelancer can still claim at expiry.
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        _warpToExpiry(id);

        uint256 freelancerBefore = usdc.balanceOf(freelancer);
        vm.prank(freelancer);
        escrow.claimAfterExpiry(id);

        (,,,,,, bool _released,,,,) = _fields(id);
        assertTrue(_released);
        assertEq(usdc.balanceOf(freelancer), freelancerBefore + AMOUNT);
    }

    // ---------------- dispute / arbitration ----------------

    function test_Dispute_RevertsUnfunded() public {
        uint256 id = _create(AMOUNT);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.NotFunded.selector);
        escrow.disputeEscrow(id);
    }

    function test_Dispute_ByClient() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        escrow.disputeEscrow(id);
        (,,,,,,,, bool _disputed,,) = _fields(id);
        assertTrue(_disputed);
    }

    function test_Dispute_ByFreelancer() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(freelancer);
        escrow.disputeEscrow(id);
        (,,,,,,,, bool _disputed,,) = _fields(id);
        assertTrue(_disputed);
    }

    function test_Dispute_RevertsNonParticipant() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotParticipant.selector);
        escrow.disputeEscrow(id);
    }

    function test_Dispute_RevertsDouble() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        escrow.disputeEscrow(id);
        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyDisputed.selector);
        escrow.disputeEscrow(id);
    }

    function test_ResolveDispute_FavorFreelancer() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        escrow.disputeEscrow(id);

        uint256 freelancerBefore = usdc.balanceOf(freelancer);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, true);

        (,,,,,, bool _released,,,,) = _fields(id);
        (,,,,,,,, bool _disputed,,) = _fields(id);
        assertTrue(_released);
        assertFalse(_disputed);
        assertEq(usdc.balanceOf(freelancer), freelancerBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ResolveDispute_FavorClient() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(freelancer);
        escrow.disputeEscrow(id);

        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, false);

        (,,,,,,, bool _refunded,,,) = _fields(id);
        (,,,,,,,, bool _disputed,,) = _fields(id);
        assertTrue(_refunded);
        assertFalse(_disputed);
        assertEq(usdc.balanceOf(client), clientBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ResolveDispute_RevertsNotArbitrator() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        escrow.disputeEscrow(id);

        vm.prank(other);
        vm.expectRevert(ArcBridgeEscrow.NotArbitrator.selector);
        escrow.resolveDispute(id, true);

        // Owner is NOT the arbitrator once setArbitrator moved the role.
        vm.prank(address(this));
        vm.expectRevert(ArcBridgeEscrow.NotArbitrator.selector);
        escrow.resolveDispute(id, true);
    }

    function test_ResolveDispute_RevertsNotDisputed() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(arbitrator);
        vm.expectRevert(ArcBridgeEscrow.NotDisputed.selector);
        escrow.resolveDispute(id, true);
    }

    function test_ResolveDispute_RevertsDouble() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(client);
        escrow.disputeEscrow(id);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, true);
        vm.prank(arbitrator);
        vm.expectRevert(ArcBridgeEscrow.NotDisputed.selector);
        escrow.resolveDispute(id, true);
    }

    function test_Dispute_BlocksReleaseAndCancelAndClaim() public {
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        vm.prank(freelancer);
        escrow.disputeEscrow(id);

        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyDisputed.selector);
        escrow.releaseFunds(id);

        vm.prank(client);
        vm.expectRevert(ArcBridgeEscrow.AlreadyDisputed.selector);
        escrow.cancelEscrow(id);

        _warpToExpiry(id);
        vm.prank(freelancer);
        vm.expectRevert(ArcBridgeEscrow.AlreadyDisputed.selector);
        escrow.claimAfterExpiry(id);
    }

    // ---------------- admin ----------------

    function test_SetArbitrator_WorksAndRevertsNonOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), other));
        escrow.setArbitrator(other);

        escrow.setArbitrator(other);
        assertEq(escrow.arbitrator(), other);
    }

    function test_SetArbitrator_RevertsZeroAddress() public {
        vm.expectRevert(ArcBridgeEscrow.InvalidArbitrator.selector);
        escrow.setArbitrator(address(0));
    }

    function test_SetDefaultDuration_AffectsNewEscrows() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), other));
        escrow.setDefaultDuration(1 days);

        escrow.setDefaultDuration(3 days);
        assertEq(escrow.defaultDuration(), 3 days);

        uint256 id = _create(AMOUNT);
        (,,,,,,,,,, uint256 _expiresAt) = _fields(id);
        assertEq(_expiresAt, block.timestamp + 3 days);
    }

    // ---------------- fuzz ----------------

    function testFuzz_CreateFundCancelAfterExpiry(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        uint256 id = _create(amount);
        vm.prank(client);
        escrow.depositFunds(id);
        _warpToExpiry(id);

        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(client);
        escrow.cancelEscrow(id);

        (,,,,,,, bool _refunded,,,) = _fields(id);
        assertTrue(_refunded);
        assertEq(usdc.balanceOf(client), clientBefore + amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ---------------- escrow cap ----------------

    function test_EscrowCap_DefaultIsFifty() public {
        assertEq(escrow.maxEscrowsPerClient(), 50);
    }

    function test_EscrowCap_AllowsUpToCap() public {
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(client);
            escrow.createEscrow(freelancer, AMOUNT);
        }
        assertEq(escrow.clientEscrowCount(client), 50);
        assertEq(escrow.escrowCount(), 50);
    }

    function test_EscrowCap_BlocksExcess() public {
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(client);
            escrow.createEscrow(freelancer, AMOUNT);
        }

        vm.expectRevert(ArcBridgeEscrow.EscrowCapExceeded.selector);
        vm.prank(client);
        escrow.createEscrow(freelancer, AMOUNT);
        assertEq(escrow.escrowCount(), 50);
    }

    function test_EscrowCap_BlocksExcessWithDeadline() public {
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(client);
            escrow.createEscrow(freelancer, AMOUNT);
        }

        vm.expectRevert(ArcBridgeEscrow.EscrowCapExceeded.selector);
        vm.prank(client);
        escrow.createEscrowWithDeadline(freelancer, AMOUNT, 1 days);
    }

    function test_EscrowCap_IsPerClient() public {
        // A different wallet is unaffected by the client's count.
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(client);
            escrow.createEscrow(freelancer, AMOUNT);
        }
        vm.prank(other);
        escrow.createEscrow(freelancer, AMOUNT);
        assertEq(escrow.clientEscrowCount(other), 1);
    }

    function test_EscrowCap_OwnerCanChange() public {
        // The test contract deploys the escrow, so it is already the owner.
        escrow.setMaxEscrowsPerClient(2);
        assertEq(escrow.maxEscrowsPerClient(), 2);

        vm.prank(client);
        escrow.createEscrow(freelancer, AMOUNT);
        vm.prank(client);
        escrow.createEscrow(freelancer, AMOUNT);

        vm.expectRevert(ArcBridgeEscrow.EscrowCapExceeded.selector);
        vm.prank(client);
        escrow.createEscrow(freelancer, AMOUNT);
    }

    function test_EscrowCap_OnlyOwnerCanChange() public {
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), other));
        vm.prank(other);
        escrow.setMaxEscrowsPerClient(2);
    }

    function test_EscrowCap_RejectsZero() public {
        vm.expectRevert(ArcBridgeEscrow.InvalidAmount.selector);
        escrow.setMaxEscrowsPerClient(0);
    }

    // ---------------- rescue ----------------

    function _rescue(address token, address recipient) internal {
        // The test contract deployed the escrow, so it is already the owner.
        escrow.rescueTokens(IERC20(token), recipient);
    }

    function test_Rescue_NonOwnerReverts() public {
        usdc.mint(address(escrow), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), other));
        vm.prank(other);
        escrow.rescueTokens(IERC20(address(usdc)), other);
    }

    function test_Rescue_ZeroRecipientReverts() public {
        usdc.mint(address(escrow), AMOUNT);
        vm.expectRevert(ArcBridgeEscrow.RescueZeroAddress.selector);
        _rescue(address(usdc), address(0));
    }

    function test_Rescue_EmptyBalanceReverts() public {
        vm.expectRevert(ArcBridgeEscrow.NothingToRescue.selector);
        _rescue(address(usdc), address(0xBeef));
    }

    function test_Rescue_AccidentalUsdcExcess() public {
        // 100 USDC locked in escrow + 25 USDC accidentally sent to the contract.
        _createAndFund(AMOUNT);
        usdc.mint(address(escrow), 25e6);
        assertEq(escrow.lockedBalance(), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT + 25e6);

        uint256 ownerBefore = usdc.balanceOf(address(this));
        _rescue(address(usdc), address(this));

        // Only the 25 USDC excess leaves; the 100 USDC escrow deposit stays.
        assertEq(usdc.balanceOf(address(this)), ownerBefore + 25e6);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(escrow.lockedBalance(), AMOUNT);
    }

    function test_Rescue_CannotTouchEscrowFunds() public {
        // Locked funds alone are not rescusable — owner only gets excess.
        _createAndFund(AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        vm.expectRevert(ArcBridgeEscrow.NothingToRescue.selector);
        _rescue(address(usdc), address(this));
    }

    function test_Rescue_AfterReleaseExcessIsFullBalance() public {
        // Once everything is released, lockedBalance is 0 and any leftover
        // balance is rescueable in full.
        uint256 id = _fundedSubmittedApproved(AMOUNT);
        vm.prank(client);
        escrow.releaseFunds(id);
        assertEq(escrow.lockedBalance(), 0);

        usdc.mint(address(escrow), 10e6);
        uint256 ownerBefore = usdc.balanceOf(address(this));
        _rescue(address(usdc), address(this));
        assertEq(usdc.balanceOf(address(this)), ownerBefore + 10e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Rescue_NonEscrowTokenFullBalance() public {
        // Any non-USDC token accidentally received is rescued in full.
        MockUSDC randomToken = new MockUSDC();
        randomToken.mint(address(escrow), 1_000e6);
        assertEq(randomToken.balanceOf(address(escrow)), 1_000e6);

        uint256 ownerBefore = randomToken.balanceOf(address(this));
        _rescue(address(randomToken), address(this));
        assertEq(randomToken.balanceOf(address(this)), ownerBefore + 1_000e6);
        assertEq(randomToken.balanceOf(address(escrow)), 0);
    }

    function test_Rescue_LockedBalanceTracksDisputeResolution() public {
        uint256 id = _createAndFund(AMOUNT);
        vm.prank(freelancer);
        escrow.disputeEscrow(id);
        assertEq(escrow.lockedBalance(), AMOUNT);

        // Resolve in favor of the client: funds leave, lockedBalance drops.
        vm.prank(arbitrator);
        escrow.resolveDispute(id, false);
        assertEq(escrow.lockedBalance(), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
