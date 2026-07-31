// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(
        address to,
        uint256 amount
    ) external returns (bool);

    function balanceOf(
        address account
    ) external view returns (uint256);
}

contract ArcBridgeEscrow {

    struct Escrow {
        address client;
        address freelancer;
        uint256 amount;
        bool funded;
        bool workSubmitted;
        bool approved;
        bool released;
    }

    uint256 public escrowCount;

    mapping(uint256 => Escrow) public escrows;

    IERC20 public immutable usdc;

    constructor(address _usdc) {
    require(_usdc != address(0), "Invalid USDC address");
    usdc = IERC20(_usdc);
    }

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 amount
    );

    event FundsDeposited(
        uint256 indexed escrowId,
        uint256 amount
    );

    event WorkSubmitted(
        uint256 indexed escrowId
    );

    event WorkApproved(
    uint256 indexed escrowId
    );

    event FundsReleased(
    uint256 indexed escrowId,
    uint256 amount
    );

    function createEscrow(
        address _freelancer,
        uint256 _amount
    ) public {

        require(_freelancer != address(0), "Invalid freelancer");

        require(_amount > 0, "Amount must be greater than zero");

        escrowCount++;

        escrows[escrowCount] = Escrow({
            client: msg.sender,
            freelancer: _freelancer,
            amount: _amount,
            funded: false,
            workSubmitted: false,
            approved: false,
            released: false
        });

        emit EscrowCreated(
            escrowCount,
            msg.sender,
            _freelancer,
            _amount
        );
    }

    function depositFunds(uint256 _escrowId) public {

        Escrow storage escrow = escrows[_escrowId];

        require(escrow.client == msg.sender, "Only client can deposit");

        require(!escrow.funded, "Already funded");

        bool success = usdc.transferFrom(
        msg.sender,
        address(this),
        escrow.amount
        );

        require(success, "USDC transfer failed");

        escrow.funded = true;

        emit FundsDeposited(
        _escrowId,
        escrow.amount
        );

    
    }

    function submitWork(uint256 _escrowId) public {

        Escrow storage escrow = escrows[_escrowId];

        require(
        escrow.freelancer == msg.sender,
        "Only freelancer can submit work"
        );

        require(
        escrow.funded,
        "Escrow not funded"
        );

        require(
        !escrow.workSubmitted,
        "Work already submitted"
        );

        escrow.workSubmitted = true;

        emit WorkSubmitted(_escrowId);
    }
    
    function approveWork(uint256 _escrowId) public {

        Escrow storage escrow = escrows[_escrowId];

        require(
        escrow.client == msg.sender,
        "Only client can approve"
        );

        require(
        escrow.workSubmitted,
        "Work not submitted"
        );

        require(
        !escrow.approved,
        "Already approved"
        );

        escrow.approved = true;

        emit WorkApproved(_escrowId);
    }

    function releaseFunds(uint256 _escrowId) public {

        Escrow storage escrow = escrows[_escrowId];

        require(
        escrow.client == msg.sender,
        "Only client can release funds"
        );

        require(
        escrow.approved,
        "Work not approved"
        );

        require(
        !escrow.released,
        "Funds already released"
        );

        bool success = usdc.transfer(
        escrow.freelancer,
        escrow.amount
        );

        require(
        success,
        "USDC transfer failed"
        );

        escrow.released = true;

        emit FundsReleased(
        _escrowId,
        escrow.amount
        );
    }

}