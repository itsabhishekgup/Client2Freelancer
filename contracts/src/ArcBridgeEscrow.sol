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

contract ArcBridgeEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error InvalidUSDC();
    error InvalidFreelancer();
    error InvalidAmount();
    error NotClient();
    error NotFreelancer();
    error AlreadyFunded();
    error NotFunded();
    error AlreadySubmitted();
    error NotSubmitted();
    error AlreadyApproved();
    error NotApproved();
    error AlreadyReleased();

    struct Escrow {
        address client;
        address freelancer;
        uint256 amount;
        bool funded;
        bool workSubmitted;
        bool approved;
        bool released;
    }

    IERC20 public immutable usdc;
    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(uint256 indexed escrowId,address indexed client,address indexed freelancer,uint256 amount);
    event FundsDeposited(uint256 indexed escrowId,uint256 amount);
    event WorkSubmitted(uint256 indexed escrowId);
    event WorkApproved(uint256 indexed escrowId);
    event FundsReleased(uint256 indexed escrowId,uint256 amount);

    constructor(address _usdc) Ownable(msg.sender){
        if(_usdc==address(0)) revert InvalidUSDC();
        usdc = IERC20(_usdc);
    }

    function createEscrow(address f,uint256 a) external {
        if(f==address(0)) revert InvalidFreelancer();
        if(a==0) revert InvalidAmount();
        escrowCount++;
        escrows[escrowCount]=Escrow(msg.sender,f,a,false,false,false,false);
        emit EscrowCreated(escrowCount,msg.sender,f,a);
    }

    function depositFunds(uint256 id) external nonReentrant{
        Escrow storage e=escrows[id];
        if(e.client!=msg.sender) revert NotClient();
        if(e.funded) revert AlreadyFunded();       
        usdc.safeTransferFrom(msg.sender,address(this),e.amount);
        e.funded=true;
        emit FundsDeposited(id,e.amount);
    }

    function submitWork(uint256 id) external{
        Escrow storage e=escrows[id];
        if(e.freelancer!=msg.sender) revert NotFreelancer();
        if(!e.funded) revert NotFunded();
        if(e.workSubmitted) revert AlreadySubmitted();
        e.workSubmitted=true;
        emit WorkSubmitted(id);
    }

    function approveWork(uint256 id) external{
        Escrow storage e=escrows[id];
        if(e.client!=msg.sender) revert NotClient();
        if(!e.workSubmitted) revert NotSubmitted();
        if(e.approved) revert AlreadyApproved();
        e.approved=true;
        emit WorkApproved(id);
    }

    function releaseFunds(uint256 id) external nonReentrant{
        Escrow storage e=escrows[id];
        if(e.client!=msg.sender) revert NotClient();
        if(!e.approved) revert NotApproved();
        if(e.released) revert AlreadyReleased();
        e.released=true;
        usdc.safeTransfer(e.freelancer,e.amount);
        emit FundsReleased(id,e.amount);
    }
}
