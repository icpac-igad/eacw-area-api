const nock = require('nock');
const chai = require('chai');
const mongoose = require('mongoose');

const Area = require('models/area.modelV2');
const { createArea } = require('../utils/helpers');
const { USERS } = require('../utils/test.constants');
const { getTestServer } = require('../utils/test-server');
const { mockSubscriptionFindByIds } = require('../utils/helpers');

chai.should();
nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);
const requester = getTestServer();

describe('V2 - Area status', () => {
    before(() => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Getting an area that exists in the areas database always returns the status saved in the database', async () => {
        const savedArea = await new Area(createArea({ userId: USERS.USER.id, status: 'saved' })).save();
        const pendingArea = await new Area(createArea({ userId: USERS.USER.id, status: 'pending' })).save();

        const savedResponse = await requester.get(`/api/v2/area/${savedArea.id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        savedResponse.status.should.equal(200);
        savedResponse.body.should.have.property('data').and.be.an('object');
        savedResponse.body.data.should.have.property('attributes').and.be.an('object');
        savedResponse.body.data.attributes.should.have.property('status').and.equal('saved');

        const pendingResponse = await requester.get(`/api/v2/area/${pendingArea.id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        pendingResponse.status.should.equal(200);
        pendingResponse.body.should.have.property('data').and.be.an('object');
        pendingResponse.body.data.should.have.property('attributes').and.be.an('object');
        pendingResponse.body.data.attributes.should.have.property('status').and.equal('pending');
    });

    it('Getting an area that does not exist in the areas database returns areas with the correct status - CASE 1', async () => {
        // CASE 1: Test area refers to a geostore, and exists at least one area for the same geostore with status saved
        // Test area should have status saved
        await new Area(createArea({ userId: USERS.USER.id, geostore: '123', status: 'saved' })).save();

        // Mock the test area
        const id = new mongoose.Types.ObjectId();
        mockSubscriptionFindByIds([id], { userId: USERS.USER.id });
        const response = await requester.get(`/api/v2/area/${id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('subscriptionId').and.equal(id.toHexString());
        response.body.data.attributes.should.have.property('status').and.equal('saved');
    });

    it('Getting an area that does not exist in the areas database returns areas with the correct status - CASE 2', async () => {
        // CASE 2: Test area refers to a geostore, and there does NOT exist one area for the same geostore with status saved
        // Test area should have status pending

        // Mock the test area
        const id = new mongoose.Types.ObjectId();
        mockSubscriptionFindByIds([id], { userId: USERS.USER.id });
        const response = await requester.get(`/api/v2/area/${id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('subscriptionId').and.equal(id.toHexString());
        response.body.data.attributes.should.have.property('status').and.equal('pending');
    });

    it('Getting an area that exists in the areas database returns areas with the correct status - CASE 3', async () => {
        // CASE 3: Any other case, test area should have status saved
        const id = new mongoose.Types.ObjectId();
        const testArea = await new Area(createArea({
            userId: USERS.USER.id,
            status: 'saved',
            subscriptionId: id.toHexString()
        })).save();

        // Mock the test area
        mockSubscriptionFindByIds([id], { userId: USERS.USER.id, params: { wdpaid: '123' } });
        const response = await requester.get(`/api/v2/area/${testArea.id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('subscriptionId').and.equal(id.toHexString());
        response.body.data.attributes.should.have.property('wdpaid').and.equal(123);
        response.body.data.attributes.should.have.property('status').and.equal('saved');
    });

    it('Getting an area that has status \'pending\' in the database but has geostore and attached subscription should return the correct status - pending', async () => {
        const subId = new mongoose.Types.ObjectId();
        const testArea = await new Area(createArea({
            userId: USERS.USER.id,
            status: 'pending',
            geostore: '123',
            subscriptionId: subId.toHexString(),
        })).save();

        // Mock the test area
        mockSubscriptionFindByIds([subId.toHexString()], { userId: USERS.USER.id });
        const response = await requester.get(`/api/v2/area/${testArea.id}?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('subscriptionId').and.equal(subId.toHexString());
        response.body.data.attributes.should.have.property('status').and.equal('pending');
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        await Area.deleteMany({}).exec();
    });
});
