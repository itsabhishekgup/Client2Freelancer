// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ArcBridgeEscrow} from "../src/ArcBridgeEscrow.sol";

/// @notice Deploys ArcBridgeEscrow bound to the USDC token address.
///         Reads USDC_ADDRESS from the environment (set it in contracts/.env
///         alongside PRIVATE_KEY / ARC_RPC_URL). Defaults to the Arc testnet
///         USDC placeholder so `forge script` works out of the box.
contract DeployArcBridgeEscrow is Script {
    ArcBridgeEscrow public escrow;

    function setUp() public {}

    function run() public {
        address usdc = vm.envOr("USDC_ADDRESS", address(0x3600000000000000000000000000000000000000));

        vm.startBroadcast();
        escrow = new ArcBridgeEscrow(usdc);
        vm.stopBroadcast();
    }
}
