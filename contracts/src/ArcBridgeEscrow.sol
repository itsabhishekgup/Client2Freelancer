// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
        e.funded=true;
        usdc.safeTransferFrom(msg.sender,address(this),e.amount);
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
