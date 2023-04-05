const _deploy_contracts = require("../migrations/2_deploy_contracts");
const truffleAssert = require("truffle-assertions"); // npm truffle-assertions
const BigNumber = require("bignumber.js"); // npm install bignumber.js
var assert = require("assert");
const oneEth = new BigNumber(1000000000000000000); // 1 eth

var Account = artifacts.require("../contracts/Account.sol");
var Event = artifacts.require("../contracts/Event.sol");
var Ticket = artifacts.require("../contracts/Ticket.sol");
var EventToken = artifacts.require("../contracts/EventToken.sol");
var Platform = artifacts.require("../contracts/Platform.sol");

contract("Platform", function (accounts) {
    before(async () => {
        accountInstance = await Account.deployed();
        ticketInstance = await Ticket.deployed();
        eventInstance = await Event.deployed();
        eventTokenInstance = await EventToken.deployed();
        platformInstance = await Platform.deployed();
    });
    
    /*
        Acccount Management:

        accounts[0] == contract owner
        accounts[1] == verified seller
        accounts[2] == buyer
        accounts[3] == buyer
        accounts[4] == buyer
    */

    console.log("Testing Platform contract");
    var latestEventId;

    it("Account(Seller) unable to list event if yet to be verified", async () => {
        await truffleAssert.reverts(
            platformInstance.listEvent(
                "Harry Styles concert", "Stadium", 2024, 03, 21, 18, 00, 00, 5, 65, accounts[1], {from: accounts[1], value: 0}),
            "You are not a verified seller"
        );
    });

    it("Account(Seller) not verified at the start", async () => {
        var state = await accountInstance.viewAccountState.call(accounts[1]);
        var unverifiedStatus = await accountInstance.getUnverifiedStatus.call();
        await assert.strictEqual(state.toString(),unverifiedStatus.toString(),"Account is already verified.");
    });

    it("Account(Seller) is a verified organisations", async () => {
        // make account[0] certified to verify organisations
        let certify = await accountInstance.certifyAccount(accounts[0]);

        // Set account[1] to be verified using account[0]
        let verifyAccount5 = await accountInstance.verifyAccount(accounts[1], {from: accounts[0]});
        assert(await accountInstance.viewAccountState(accounts[1]), await accountInstance.getVerifiedStatus() );
        assert(await accountInstance.viewAccountVerifier(accounts[1]), accounts[0]);
    });

    it("Verify account(Seller)", async () => {
        await accountInstance.verifyAccount(accounts[1], {from: accounts[0]});
        var state = await accountInstance.viewAccountState.call(accounts[1]);
        var verifiedStatus = await accountInstance.getVerifiedStatus.call();
        await assert.strictEqual(state.toString(),verifiedStatus.toString(),"Account is not verified.");
    });

    it("Insufficient deposits to list event", async () => {
        await truffleAssert.reverts(
            platformInstance.listEvent(
                "Harry Styles concert", "Stadium", 2024, 03, 21, 18, 00, 00, 5, 65, accounts[1], {from: accounts[1], value: 0}),
            "Insufficient deposits. Need deposit minimum (capacity * priceOfTicket)/2 * 50000 wei to list event."
        );
    });

    it("Event listed successfully", async () => {
        await platformInstance.listEvent(
            "Harry Styles concert", "Stadium", 2024, 03, 21, 18, 00, 00, 5, 65, accounts[1], {from: accounts[1], value: oneEth});
        latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        var eventTitle = await eventInstance.getEventTitle(latestEventId);
        await assert.strictEqual(eventTitle.toString(),"Harry Styles concert","Event not listed");
    });

    it("List Event", async () => {
        await accountInstance.verifyAccount(accounts[1], {from: accounts[0]});
        await platformInstance.listEvent("Title 0", "Venue 0", 2024, 3, 11, 12, 30, 0, 5, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        const title = await eventInstance.getEventTitle(latestEventId);
        await assert("Title 0", title, "Failed to create event");
    });

    it("Commence Bidding", async () => {
        let bidCommenced = await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidCommenced, "BidCommenced");
    });

    it("Place Bidding", async () => {
        let bidPlaced = await platformInstance.placeBid(latestEventId, 1, 0, {from: accounts[2], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced, "BidPlaced");
    });

    it("Close Bidding", async () => {
        let bidClosed = await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidClosed, "BidBuy");
    });

    it("Buy Ticket", async () => {
        let buyTicket = await platformInstance.buyTickets(latestEventId, 1, {from: accounts[3], value: oneEth.dividedBy(4)});
        truffleAssert.eventEmitted(buyTicket, "TransferToBuyerSuccessful");
    });

    it("Insufficent funds to buy tickets", async () => {
        await truffleAssert.reverts(
            platformInstance.buyTickets(latestEventId, 1, {from: accounts[3], value: 0}),
            "Buyer has insufficient ETH to buy tickets"
        );
    });

    it("Quantity exceeded", async () => {
        // Maximum ticket purchase limit is set to 4
        await truffleAssert.reverts(
            platformInstance.buyTickets(latestEventId, 10, {from: accounts[3], value: oneEth.dividedBy(4)}),
            "You have passed the maximum bulk purchase limit"
        );
    });

    it("Successful Payback to buyer", async () => {
        // let buyTicketProcess = await platformInstance.buyTickets(1, 3, 300, {from: accounts[1], value: 1000})
        // expectedReturn = 100;
        // let balance = await web3.eth.getBalance(accounts[0]);
        // console.log("this is the balance:",balance);
        // assert.strictEqual(balance , expectedReturn, "Incorrect payback");

        // not the best way
        let buyTicketProcess = await platformInstance.buyTickets(latestEventId, 3, {from: accounts[3], value: oneEth.dividedBy(4)})
        truffleAssert.eventEmitted(buyTicketProcess, 'TransferToBuyerSuccessful');
    });

    it("Test Priority System", async () => {
        // Listing of event with 5 tickets
        await platformInstance.listEvent("Title 1", "Venue 1", 2024, 3, 11, 12, 30, 0, 5, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        const title = await eventInstance.getEventTitle(latestEventId);
        await assert("Title 1", title, "Failed to create event");

        // Commence bidding
        let bidCommenced = await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidCommenced, "BidCommenced");
        
        // Generate token for accounts[2],[3],[4] with 5,0,6 correspondingly
        await eventTokenInstance.getTokenForTesting(accounts[2], 5, {from: accounts[0]});
        await eventTokenInstance.getTokenForTesting(accounts[3], 0, {from: accounts[0]});
        await eventTokenInstance.getTokenForTesting(accounts[4], 6, {from: accounts[0]});
        const acc2token = new BigNumber(await eventTokenInstance.checkEventToken({from: accounts[2]}));
        await assert(acc2token.isEqualTo(BigNumber(5)), "EventToken not minted");
        const acc3token = new BigNumber(await eventTokenInstance.checkEventToken({from: accounts[3]}));
        await assert(acc3token.isEqualTo(BigNumber(0)), "EventToken not minted");
        const acc4token = new BigNumber(await eventTokenInstance.checkEventToken({from: accounts[4]}));
        await assert(acc4token.isEqualTo(BigNumber(6)), "EventToken not minted");

        // accounts[2] approve Platform contract to use 5 tokens and place bid for 1 ticket with 5 tokens each
        await eventTokenInstance.approveToken(platformInstance.address, 5, {from: accounts[2]}); 
        let acc2allowance = new BigNumber(await eventTokenInstance.checkAllowance(accounts[2], platformInstance.address, {from: accounts[2]}));
        await assert(acc2allowance.isEqualTo(BigNumber(5)), "EventToken not approved");
        let bidPlaced1 = await platformInstance.placeBid(latestEventId, 1, 5, {from: accounts[2], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced1, "BidPlaced");

        // accounts[3] place bid for 2 ticket with 0 tokens each
        let bidPlaced2 = await platformInstance.placeBid(latestEventId, 2, 0, {from: accounts[3], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced2, "BidPlaced");

        // accounts[4] approve Platfrom contract to use 6 tokens and place bid for 3 tickets with 2 token each 
        await eventTokenInstance.approveToken(platformInstance.address, 6, {from: accounts[4]}); 
        let acc4allowance = new BigNumber(await eventTokenInstance.checkAllowance(accounts[4], platformInstance.address, {from: accounts[4]}));
        await assert(acc4allowance.isEqualTo(BigNumber(6)), "EventToken not approved");
        let bidPlaced3 = await platformInstance.placeBid(latestEventId, 3, 2, {from: accounts[4], value: oneEth}); 
        truffleAssert.eventEmitted(bidPlaced3, "BidPlaced");

        // Ensure that platform EventToken amount is consistent
        const acc0token = new BigNumber(await eventTokenInstance.checkEventTokenOf(Platform.address, {from: accounts[0]}));
        await assert(acc0token.isEqualTo(BigNumber(11)), "EventToken not transfered to Platform");
   
        // Close bid
        let bidClosed = await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidClosed, "BidBuy");

        // Ensure accurate ticket distribution
        let owner1 = await ticketInstance.getTicketOwner(10); // ticketId 10 belongs to accounts[2]
        assert.strictEqual(owner1, accounts[2]);
        let owner2 = await ticketInstance.getTicketOwner(11); // ticketId 11,12,13 belongs to accounts[4] 
        assert.strictEqual(owner2, accounts[4]);
        let owner3 = await ticketInstance.getTicketOwner(12); // ticketId 11,12,13 belongs to accounts[4] 
        assert.strictEqual(owner3, accounts[4]);
        let owner4 = await ticketInstance.getTicketOwner(13); // ticketId 11,12,13 belongs to accounts[4] 
        assert.strictEqual(owner4, accounts[4]);
        let owner5 = await ticketInstance.getTicketOwner(14); // ticketId 15 belongs to accounts[3] 
        assert.strictEqual(owner5, accounts[3]);
    });

    it("Test Updating of Bid", async () => {
        // Listing of event with 1 ticket
        await platformInstance.listEvent("Title 1", "Venue 1", 2024, 3, 11, 12, 30, 0, 1, 1, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        const title = await eventInstance.getEventTitle(latestEventId);
        await assert("Title 1", title, "Failed to create event");

        // Commence bidding
        let bidCommenced = await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidCommenced, "BidCommenced");
        
        // Generate token for accounts[2],[3] with 5,6 correspondingly
        await eventTokenInstance.getTokenForTesting(accounts[2], 5, {from: accounts[0]});
        await eventTokenInstance.getTokenForTesting(accounts[3], 6, {from: accounts[0]});
        const acc2token = new BigNumber(await eventTokenInstance.checkEventToken({from: accounts[2]}));
        await assert(acc2token.isEqualTo(BigNumber(5)), "EventToken not minted");
        const acc3token = new BigNumber(await eventTokenInstance.checkEventToken({from: accounts[3]}));
        await assert(acc3token.isEqualTo(BigNumber(6)), "EventToken not minted");

        // accounts[3] place bid for 1 ticket with 0 tokens each
        let bidPlaced1 = await platformInstance.placeBid(latestEventId, 1, 0, {from: accounts[3], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced1, "BidPlaced");

        // accounts[2] approve Platform contract to use 5 tokens and place bid for 1 ticket with 5 tokens each
        await eventTokenInstance.approveToken(platformInstance.address, 5, {from: accounts[2]}); 
        let acc2allowance = new BigNumber(await eventTokenInstance.checkAllowance(accounts[2], platformInstance.address, {from: accounts[2]}));
        await assert(acc2allowance.isEqualTo(BigNumber(5)), "EventToken not approved");
        let bidPlaced2 = await platformInstance.placeBid(latestEventId, 1, 5, {from: accounts[2], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced2, "BidPlaced");

        // accounts[3] approve Platform contract to use 6 tokens and update bid for 1 ticket with 6 tokens each
        await eventTokenInstance.approveToken(platformInstance.address, 6, {from: accounts[3]}); 
        let acc3allowance = new BigNumber(await eventTokenInstance.checkAllowance(accounts[3], platformInstance.address, {from: accounts[3]}));
        await assert(acc3allowance.isEqualTo(BigNumber(6)), "EventToken not approved");
        let updateBid1 = await platformInstance.updateBid(latestEventId, 6, {from: accounts[3]});
        truffleAssert.eventEmitted(updateBid1, "BidUpdate");

        // Ensure that platform EventToken amount is consistent
        const acc0token = new BigNumber(await eventTokenInstance.checkEventTokenOf(Platform.address, {from: accounts[0]}));
        await assert(acc0token.isEqualTo(BigNumber(22)), "EventToken not transfered to Platform");
   
        // Close bid
        let bidClosed = await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidClosed, "BidBuy");

        // Ensure accurate ticket distribution
        let owner1 = await ticketInstance.getTicketOwner(15); // ticketId 15 belongs to accounts[3]
        assert.strictEqual(owner1, accounts[3]);
    });

    it("Test Unsuccessful Bid Return ETH", async () => {
        // Listing of event with 1 ticket
        await platformInstance.listEvent("Title 1", "Venue 1", 2024, 3, 11, 12, 30, 0, 1, 1, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        const title = await eventInstance.getEventTitle(latestEventId);
        await assert("Title 1", title, "Failed to create event");

        // Commence bidding
        let bidCommenced = await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidCommenced, "BidCommenced");

        // accounts[2] place bid for 1 ticket with 0 tokens each
        let bidPlaced1 = await platformInstance.placeBid(latestEventId, 1, 0, {from: accounts[2], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced1, "BidPlaced");

        // accounts[3] place bid for 1 ticket with 0 tokens each
        let initialbalance = new BigNumber(await web3.eth.getBalance(accounts[3]));
        let bidPlaced2 = await platformInstance.placeBid(latestEventId, 1, 0, {from: accounts[3], value: oneEth});
        let gasUsed = new BigNumber(bidPlaced2.receipt.gasUsed);
        let tx = await web3.eth.getTransaction(bidPlaced2.tx);
        let gasPrice = new BigNumber(tx.gasPrice);
        truffleAssert.eventEmitted(bidPlaced2, "BidPlaced");
   
        // Close bid
        let bidClosed = await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidClosed, "BidBuy");

        // Ensure accurate ticket distribution
        let owner1 = await ticketInstance.getTicketOwner(16); // ticketId 16 belongs to accounts[2]
        assert.strictEqual(owner1, accounts[2]);

        // Ensure ETH is returned to unsuccessful bidder accounts[3]
        let finalbalance = new BigNumber(await web3.eth.getBalance(accounts[3]));
        await assert(finalbalance.isEqualTo(initialbalance.minus(gasPrice.multipliedBy(gasUsed))), "Did not return ETH back to unsuccessful bidders");

    });

    it("Test Successful Bid -> Refund Ticket -> Buy Ticket", async () => {
        // Listing of event with 1 ticket
        await platformInstance.listEvent("Title 1", "Venue 1", 2024, 3, 11, 12, 30, 0, 1, 1, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        const title = await eventInstance.getEventTitle(latestEventId);
        await assert("Title 1", title, "Failed to create event");

        // Commence bidding
        let bidCommenced = await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidCommenced, "BidCommenced");

        // accounts[2] place bid for 1 ticket with 0 tokens each
        let bidPlaced1 = await platformInstance.placeBid(latestEventId, 1, 0, {from: accounts[2], value: oneEth});
        truffleAssert.eventEmitted(bidPlaced1, "BidPlaced");
   
        // Close bid
        let bidClosed = await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        truffleAssert.eventEmitted(bidClosed, "BidBuy");

        // Ensure accurate ticket distribution
        let owner1 = await ticketInstance.getTicketOwner(17); // ticketId 17 belongs to accounts[2]
        assert.strictEqual(owner1, accounts[2]);

        // accounts[2] transfer ticket to platform then refund ticket
        await ticketInstance.transferTicket(17, platformInstance.address, {from: accounts[2]});

        let initialbalance = new BigNumber(await web3.eth.getBalance(accounts[2]));
        let refundTicket1 = await platformInstance.refundTicket(17, {from: accounts[2]});
        truffleAssert.eventEmitted(refundTicket1, "RefundTicket");
        let gasUsed = new BigNumber(refundTicket1.receipt.gasUsed);
        let tx = await web3.eth.getTransaction(refundTicket1.tx);
        let gasPrice = new BigNumber(tx.gasPrice);

        // Ensure ETH is refunded to refunder accounts[2] at half price
        let finalbalance = new BigNumber(await web3.eth.getBalance(accounts[2]));
        let halfPriceOfTicket = new BigNumber(await eventInstance.getEventTicketPrice(latestEventId)).dividedBy(2);
        // Initial - GasFees + Refund = Final ====> Initial - GasFees = Final - Refund
        await assert((finalbalance.minus(halfPriceOfTicket)).isEqualTo((initialbalance.minus(gasPrice.multipliedBy(gasUsed)))), "Did not return ETH back to refunder");

        // accounts[3] buy ticket
        let buyTicket1 = await platformInstance.buyTickets(latestEventId, 1, {from: accounts[3], value: oneEth});
        truffleAssert.eventEmitted(buyTicket1, "TransferToBuyerSuccessful");

        // Ensure accurate ticket distribution
        let owner2 = await ticketInstance.getTicketOwner(17); // ticketId 17 belongs to accounts[3]
        assert.strictEqual(owner2, accounts[3]);
    });

    it("Only original seller can end event", async () => {
        await accountInstance.verifyAccount(accounts[8], {from: accounts[0]});

        await platformInstance.listEvent("Title 2", "Venue 2", 2024, 3, 11, 12, 30, 0, 5, 20, accounts[1], {from: accounts[1], value: oneEth.multipliedBy(4)});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        
        await truffleAssert.reverts(platformInstance.endEvent(latestEventId, {from: accounts[2]}),"You are not a verified seller")
        await truffleAssert.reverts(platformInstance.endEvent(latestEventId, {from: accounts[8]}),"Only original seller can end event")
    });

    it("Seller deposits and 95% of ticket sales, successfully transferred to seller when event ends", async () => {
        await platformInstance.listEvent("Title 3", "Venue 3", 2024, 3, 11, 12, 30, 0, 5, 65, accounts[1], {from: accounts[1], value: oneEth});
        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();
        await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        await platformInstance.buyTickets(latestEventId, 4, {from: accounts[3], value: oneEth.dividedBy(4)});

        // Find initialSellerBalance before performing endEvent function
        let initialSellerBalance = new BigNumber(await web3.eth.getBalance(accounts[1]));

        // Find gasFees for performing endEvent function
        let end = await platformInstance.endEvent(latestEventId, {from: accounts[1]});
        let gasUsed = new BigNumber(end.receipt.gasUsed);
        let tx = await web3.eth.getTransaction(end.tx);
        let gasPrice = new BigNumber(tx.gasPrice);
        let gasFees = gasPrice.multipliedBy(gasUsed);

        let finalSellerBalance = new BigNumber(await web3.eth.getBalance(accounts[1]));

        // Seller takes 95% of ticket sales
        let sellerTicketSales = new BigNumber(95 * 4 * 65 / 100);

        // sellerBalanceBeforeEndEvent + sellerTicketSales + depositedEth - gasFeesForEndEvent = finalSellerBalance
        initialSellerBalance = initialSellerBalance.plus(sellerTicketSales).plus(oneEth).minus(gasFees);
        
        await assert(
            finalSellerBalance.isEqualTo(initialSellerBalance),
            "Seller did not received right amount of Eth when event ended."
        )
    });

    it("Platform keeps 5% commission of ticket sales when event ends", async () => {
        let platformAddr = await platformInstance.getPlatformAddr();
        //console.log("finalamt: " + platformAddr);
        let platformOriginalEth = new BigNumber(await accountInstance.getBalance(platformAddr));
        await platformInstance.listEvent("Title 3", "Venue 3", 2024, 3, 11, 12, 30, 0, 5, 65, accounts[1], {from: accounts[1], value: oneEth});

        let latestEventId = (await eventInstance.getLatestEventId()).toNumber();

        await platformInstance.commenceBidding(latestEventId, {from: accounts[1]});
        await platformInstance.closeBidding(latestEventId, {from: accounts[1]});
        await platformInstance.buyTickets(latestEventId, 4, {from: accounts[3], value: oneEth.dividedBy(4)});
        await platformInstance.endEvent(latestEventId, {from: accounts[1]});

        let platformAmt = new BigNumber(await accountInstance.getBalance(platformAddr));

        let platformCommission = new BigNumber(5 * 4 * 65 / 100);
        let platformAmt2 = platformOriginalEth.plus(platformCommission);
        
        await assert(
            platformAmt.isEqualTo(platformAmt2),
            "Seller did not received right amount of Eth when event ended."
        )
    });

})