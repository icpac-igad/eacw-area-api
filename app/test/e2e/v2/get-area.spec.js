/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');
const Area = require('models/area.modelV2');
const { createArea } = require('../utils/helpers');
const { USERS } = require('../utils/test.constants');

chai.should();

const { getTestServer } = require('../utils/test-server');
const { mockSubscriptionFindForUser, mockSubscriptionFindAll } = require('../utils/helpers');

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const requester = getTestServer();

describe('Get areas - V2', () => {
    before(() => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Getting areas without being logged in should return a 401 - "Not logged" error', async () => {
        const response = await requester.get(`/api/v2/area`);
        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not logged`);
    });

    it('Getting areas being logged in should return a 200 OK with all the areas for the current user', async () => {
        mockSubscriptionFindForUser(USERS.USER.id, []);
        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(0);
    });

    it('Getting areas having no subscriptions should return a 200 OK with all the areas and subscriptions for the current user', async () => {
        mockSubscriptionFindForUser(USERS.USER.id, []);
        const area = await new Area(createArea({ userId: USERS.USER.id })).save();
        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(area.id);
    });

    it('Getting areas having some subscriptions should return a 200 OK with all the areas and subscriptions for the current user', async () => {
        mockSubscriptionFindForUser(USERS.USER.id, ['123', '456']);
        const createdArea = await new Area(createArea({ userId: USERS.USER.id })).save();
        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);

        response.body.data.find((area) => area.id === createdArea.id).should.be.an('object');
        response.body.data.find((area) => area.id === '123').should.be.an('object');
        response.body.data.find((area) => area.id === '456').should.be.an('object');
    });

    it('Getting areas having some subscriptions related to areas should return a 200 OK with all the areas and subscriptions for the current user', async () => {
        mockSubscriptionFindForUser(USERS.USER.id, ['123', '456']);
        const area = await new Area(createArea({ userId: USERS.USER.id })).save();
        await new Area(createArea({ userId: USERS.USER.id, subscriptionId: '123' })).save();

        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);

        // eslint-disable-next-line no-unused-expressions
        response.body.data.find((element) => element.id === area.id).should.be.ok;
        // eslint-disable-next-line no-unused-expressions
        response.body.data.find((element) => element.attributes.subscriptionId === '123').should.be.ok;
        // eslint-disable-next-line no-unused-expressions
        response.body.data.find((element) => element.attributes.subscriptionId === '456').should.be.ok;
    });

    it('Getting areas sending query param all as an USER/MANAGER should return a 200 OK with only the user areas (query filter is ignored)', async () => {
        await new Area(createArea({ userId: USERS.USER.id })).save();
        await new Area(createArea({ userId: USERS.MANAGER.id })).save();
        await new Area(createArea({ userId: USERS.ADMIN.id })).save();

        mockSubscriptionFindForUser(USERS.USER.id, ['123']);
        const userResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&all=true`);
        userResponse.status.should.equal(200);
        // USER area + the subscription
        userResponse.body.should.have.property('data').and.be.an('array').and.have.length(2);

        mockSubscriptionFindForUser(USERS.MANAGER.id, ['456']);
        const managerResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.MANAGER)}&all=true`);
        managerResponse.status.should.equal(200);
        // MANAGER area + the subscription
        managerResponse.body.should.have.property('data').and.be.an('array').and.have.length(2);
    });

    it('Getting areas sending query param all as an ADMIN should return a 200 OK with all the areas (even not owned by the user)', async () => {
        await new Area(createArea({ userId: USERS.USER.id })).save();
        await new Area(createArea({ userId: USERS.MANAGER.id })).save();
        await new Area(createArea({ userId: USERS.ADMIN.id, subscriptionId: '123' })).save();

        // Mock three subscriptions
        mockSubscriptionFindAll(
            ['123', '456', '789'],
            [{ userId: USERS.USER.id }, { userId: USERS.MANAGER.id }, { userId: USERS.ADMIN.id }]
        );

        // First sync areas
        const response = await requester.post(`/api/v2/area/sync`).send({ loggedUser: USERS.ADMIN });
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('syncedAreas').and.equal(1);
        response.body.data.should.have.property('createdAreas').and.equal(2);

        // Get all areas
        const getResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true`);
        getResponse.status.should.equal(200);
        getResponse.body.should.have.property('data').and.be.an('array').and.have.length(5);
    });

    it('Getting areas filtered by application should return a 200 OK with only areas for the application requested', async () => {
        await new Area(createArea({ userId: USERS.USER.id, application: 'rw' })).save();
        await new Area(createArea({ userId: USERS.USER.id, application: 'gfw' })).save();

        mockSubscriptionFindForUser(USERS.USER.id, ['123']);
        const rwResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&application=rw`);
        rwResponse.status.should.equal(200);
        rwResponse.body.should.have.property('data').and.be.an('array');
        rwResponse.body.data.every((area) => area.attributes.application === 'rw').should.be.true;

        mockSubscriptionFindForUser(USERS.USER.id, ['456']);
        const gfwResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&application=gfw`);
        gfwResponse.status.should.equal(200);
        gfwResponse.body.should.have.property('data').and.be.an('array');
        gfwResponse.body.data.every((area) => area.attributes.application === 'gfw').should.be.true;
    });

    it('Getting areas filtered by status should return a 200 OK with only areas for the status requested', async () => {
        await new Area(createArea({ userId: USERS.USER.id, status: 'saved' })).save();
        await new Area(createArea({ userId: USERS.USER.id, status: 'pending' })).save();

        mockSubscriptionFindForUser(USERS.USER.id, ['123']);
        const savedResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&status=saved`);
        savedResponse.status.should.equal(200);
        savedResponse.body.should.have.property('data').and.be.an('array');
        savedResponse.body.data.every((area) => area.attributes.status === 'saved').should.be.true;

        mockSubscriptionFindForUser(USERS.USER.id, ['456']);
        const pendingResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&status=pending`);
        pendingResponse.status.should.equal(200);
        pendingResponse.body.should.have.property('data').and.be.an('array');
        pendingResponse.body.data.every((area) => area.attributes.status === 'pending').should.be.true;
    });

    it('Getting areas filtered by public should return a 200 OK with only public areas', async () => {
        await new Area(createArea({ userId: USERS.USER.id, public: true })).save();
        await new Area(createArea({ userId: USERS.USER.id, public: false })).save();

        mockSubscriptionFindForUser(USERS.USER.id, ['123']);
        const publicResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&public=true`);
        publicResponse.status.should.equal(200);
        publicResponse.body.should.have.property('data').and.be.an('array');
        publicResponse.body.data.every((area) => area.attributes.public === true).should.be.true;

        mockSubscriptionFindForUser(USERS.USER.id, ['456']);
        const privateResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.USER)}&public=false`);
        privateResponse.status.should.equal(200);
        privateResponse.body.should.have.property('data').and.be.an('array');
        privateResponse.body.data.every((area) => area.attributes.public === false).should.be.true;
    });

    it('Getting areas sending query param all as an ADMIN should return a 200 OK with ALL the areas and ALL the subscriptions', async () => {
        await new Area(createArea({ userId: USERS.USER.id })).save();
        await new Area(createArea({ userId: USERS.MANAGER.id })).save();

        mockSubscriptionFindAll(
            ['123', '456', '789'],
            [{ userId: USERS.USER.id }, { userId: USERS.MANAGER.id }, { userId: USERS.ADMIN.id }]
        );

        // First sync areas
        const response = await requester.post(`/api/v2/area/sync`).send({ loggedUser: USERS.ADMIN });
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('syncedAreas').and.equal(0);
        response.body.data.should.have.property('createdAreas').and.equal(3);

        const getResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true`);
        getResponse.status.should.equal(200);
        getResponse.body.should.have.property('data').and.be.an('array').and.have.length(5);
    });

    it('Getting areas sending query param all along with other filters should return a 200 OK with the correct data', async () => {
        await new Area(createArea({ userId: USERS.USER.id, status: 'saved' })).save();
        await new Area(createArea({ userId: USERS.MANAGER.id, status: 'pending' })).save();

        mockSubscriptionFindAll(
            ['123', '456', '789'],
            [{ userId: USERS.USER.id }, { userId: USERS.MANAGER.id }, { userId: USERS.ADMIN.id }]
        );

        // First sync areas
        const syncResponse = await requester.post(`/api/v2/area/sync`).send({ loggedUser: USERS.ADMIN });
        syncResponse.status.should.equal(200);
        syncResponse.body.should.have.property('data').and.be.an('object');
        syncResponse.body.data.should.have.property('syncedAreas').and.equal(0);
        syncResponse.body.data.should.have.property('createdAreas').and.equal(3);

        // Requesting all areas => should return 5 areas
        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true`);
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(5);

        // Requesting all areas with status saved => should return 1 area
        const savedResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true&status=saved`);
        savedResponse.status.should.equal(200);
        savedResponse.body.should.have.property('data').and.be.an('array').and.have.length(4);

        // Requesting all areas with status pending => should return 4 areas
        const pendingResponse = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true&status=pending`);
        pendingResponse.status.should.equal(200);
        pendingResponse.body.should.have.property('data').and.be.an('array').and.have.length(1);
    });

    it('Getting areas with all=true filter returns the correct paginated result', async () => {
        const area1 = await new Area(createArea()).save();
        const area2 = await new Area(createArea()).save();
        const area3 = await new Area(createArea()).save();
        const area4 = await new Area(createArea()).save();
        const area5 = await new Area(createArea()).save();

        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true&page[size]=3`);
        response.status.should.equal(200);
        response.body.should.have.property('data').with.lengthOf(3);
        response.body.should.have.property('links').and.be.an('object');

        const ids = response.body.data.map((area) => area.id);
        ids.should.contain(area1.id);
        ids.should.contain(area2.id);
        ids.should.contain(area3.id);
        ids.should.not.contain(area4.id);
        ids.should.not.contain(area5.id);
    });

    it('Getting areas with all=true and requesting the second page returns the correct paginated result', async () => {
        const area1 = await new Area(createArea()).save();
        const area2 = await new Area(createArea()).save();
        const area3 = await new Area(createArea()).save();
        const area4 = await new Area(createArea()).save();
        const area5 = await new Area(createArea()).save();

        const response = await requester.get(`/api/v2/area?loggedUser=${JSON.stringify(USERS.ADMIN)}&all=true&page[number]=2&page[size]=2`);
        response.status.should.equal(200);
        response.body.should.have.property('data').with.lengthOf(2);
        response.body.should.have.property('links').and.be.an('object');

        const ids = response.body.data.map((area) => area.id);
        ids.should.not.contain(area1.id);
        ids.should.not.contain(area2.id);
        ids.should.contain(area3.id);
        ids.should.contain(area4.id);
        ids.should.not.contain(area5.id);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        await Area.deleteMany({}).exec();
    });
});
