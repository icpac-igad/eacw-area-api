const Router = require('koa-router');
const logger = require('logger');
const AreaSerializerV2 = require('serializers/area.serializerV2');
const AreaModel = require('models/area.modelV2');
const AreaValidatorV2 = require('validators/area.validatorV2');
const TeamService = require('services/team.service');
const SubscriptionService = require('services/subscription.service');
const s3Service = require('services/s3.service');

const findAreaOrSubscriptionById = async (id) => {
    const areas = await AreaModel.find({ _id: id });

    if (!areas || areas.length === 0) {
        return SubscriptionService.getSubscriptionById(id);
    }

    return areas[0];
};

class AreaRouterV2 {

    static async getAll(ctx) {
        logger.info('Obtaining all v2 areas of the user ', ctx.state.loggedUser.id);
        const filter = { userId: ctx.state.loggedUser.id };
        if (ctx.query.application) {
            filter.application = ctx.query.application.split(',').map((el) => el.trim());
        }
        const areas = await AreaModel.find(filter);
        const subscriptions = await SubscriptionService.getSubscriptionsForUser(filter);
        const returnData = areas.concat(subscriptions);
        ctx.body = AreaSerializerV2.serialize(returnData);
    }

    static async get(ctx) {
        logger.info(`Obtaining v2 area with areaId ${ctx.params.id}`);

        const area = await findAreaOrSubscriptionById(ctx.params.id);
        if (area === null) {
            ctx.throw(404, 'Area not found');
            return;
        }

        const user = (ctx.state.loggedUser && ctx.state.loggedUser.id) || null;
        if (area.public === false && area.userId !== user) {
            ctx.throw(401, 'Area private');
            return;
        }

        if (area.public === true && area.userId !== user) {
            area.tags = null;
            area.userId = null;
            area.monthlySummary = null;
            area.deforestationAlerts = null;
            area.fireAlerts = null;
            area.name = null;
            area.webhookUrl = null;
            area.email = null;
            area.language = null;
            area.subscriptionId = null;
        }

        ctx.body = AreaSerializerV2.serialize(area);
    }

    static async save(ctx) {
        logger.info('Saving v2 area', ctx.request.body);
        const userId = ctx.state.loggedUser.id;
        let isSaved = false;

        let image = '';
        if (ctx.request.files && ctx.request.files.image) {
            image = await s3Service.uploadFile(ctx.request.files.image.path, ctx.request.files.image.name);
        }

        const geostore = (ctx.request.body && ctx.request.body.geostore) || null;
        const query = {
            $and: [
                { status: 'saved' },
                { geostore }
            ]
        };
        logger.info(`Checking if data created already for geostore ${geostore}`);
        const areas = await AreaModel.find(query);
        if (geostore && areas && areas.length > 0) {
            isSaved = true;
        }
        let datasets = [];
        if (ctx.request.body.datasets) {
            datasets = JSON.parse(ctx.request.body.datasets);
        }
        const use = {};
        if (ctx.request.body.use) {
            use.id = ctx.request.body.use ? ctx.request.body.use.id : null;
            use.name = ctx.request.body.use ? ctx.request.body.use.name : null;
        }
        const iso = {};
        if (ctx.request.body.iso) {
            iso.country = ctx.request.body.iso ? ctx.request.body.iso.country : null;
            iso.region = ctx.request.body.iso ? ctx.request.body.iso.region : null;
            if (iso.country || iso.region) {
                isSaved = true;
            }
        }
        const admin = {};
        if (ctx.request.body.admin) {
            admin.adm0 = ctx.request.body.admin ? ctx.request.body.admin.adm0 : null;
            admin.adm1 = ctx.request.body.admin ? ctx.request.body.admin.adm1 : null;
            admin.adm2 = ctx.request.body.admin ? ctx.request.body.admin.adm2 : null;
            if (admin.adm0) {
                isSaved = true;
            }
        }
        let wdpaid = null;
        if (ctx.request.body.wdpaid) {
            wdpaid = ctx.request.body.wdpaid;
            if (wdpaid) {
                isSaved = true;
            }
        }
        let tags = [];
        if (ctx.request.body.tags) {
            tags = ctx.request.body.tags;
        }
        let publicStatus = false;
        if (ctx.request.body.public) {
            publicStatus = ctx.request.body.public;
        }
        let fireAlertSub = false;
        if (ctx.request.body.fireAlerts) {
            fireAlertSub = ctx.request.body.fireAlerts;
        }
        let deforAlertSub = false;
        if (ctx.request.body.deforestationAlerts) {
            deforAlertSub = ctx.request.body.deforestationAlerts;
        }
        let webhookUrl = '';
        if (ctx.request.body.webhookUrl) {
            webhookUrl = ctx.request.body.webhookUrl;
        }
        let summarySub = false;
        if (ctx.request.body.monthlySummary) {
            summarySub = ctx.request.body.monthlySummary;
        }
        let email = '';
        if (ctx.request.body.email) {
            email = ctx.request.body.email;
        }
        let lang = '';
        if (ctx.request.body.language) {
            lang = ctx.request.body.language;
        }

        const areaData = {
            name: ctx.request.body.name,
            application: ctx.request.body.application || 'gfw',
            geostore: ctx.request.body.geostore,
            wdpaid,
            userId: userId || ctx.state.loggedUser.id,
            use,
            iso,
            admin,
            datasets,
            image,
            tags,
            status: isSaved ? 'saved' : 'pending',
            public: publicStatus,
            fireAlerts: fireAlertSub,
            deforestationAlerts: deforAlertSub,
            webhookUrl,
            monthlySummary: summarySub,
            language: lang,
            email
        };

        // First save the subscription
        const createdSub = await SubscriptionService.createSubscription(areaData);

        // Update the subscription id in the area to be saved
        areaData.subscriptionId = createdSub.id;

        // Save the area
        const area = await new AreaModel(areaData).save();

        ctx.body = AreaSerializerV2.serialize(area);
    }

    static async update(ctx) {
        const area = await AreaModel.findById(ctx.params.id);
        const { files } = ctx.request;
        if (ctx.request.body.application || !area.application) {
            area.application = ctx.request.body.application || 'gfw';
        }
        if (ctx.request.body.name) {
            area.name = ctx.request.body.name;
        }
        if (ctx.request.body.geostore) {
            area.geostore = ctx.request.body.geostore;
        }
        if (ctx.request.body.wdpaid) {
            area.wdpaid = ctx.request.body.wdpaid;
        }
        const use = {};
        if (ctx.request.body.use) {
            use.id = ctx.request.body.use ? ctx.request.body.use.id : null;
            use.name = ctx.request.body.use ? ctx.request.body.use.name : null;
        }
        area.use = use;
        const iso = {};
        if (ctx.request.body.iso) {
            iso.country = ctx.request.body.iso ? ctx.request.body.iso.country : null;
            iso.region = ctx.request.body.iso ? ctx.request.body.iso.region : null;
        }
        area.iso = iso;
        const admin = {};
        if (ctx.request.body.admin) {
            admin.adm0 = ctx.request.body.admin ? ctx.request.body.admin.adm0 : null;
            admin.adm1 = ctx.request.body.admin ? ctx.request.body.admin.adm1 : null;
            admin.adm2 = ctx.request.body.admin ? ctx.request.body.admin.adm2 : null;
        }
        area.admin = admin;
        if (ctx.request.body.datasets) {
            area.datasets = JSON.parse(ctx.request.body.datasets);
        }
        if (ctx.request.body.tags) {
            area.tags = ctx.request.body.tags;
        }
        if (ctx.request.body.status) {
            area.status = ctx.request.body.status;
        }
        if (ctx.request.body.public) {
            area.public = ctx.request.body.public;
        }
        if (ctx.request.body.status) {
            area.status = ctx.request.body.status;
        }
        const updateKeys = ctx.request.body && Object.keys(ctx.request.body);
        area.public = updateKeys.includes('public') ? ctx.request.body.public : area.public;
        area.webhookUrl = updateKeys.includes('webhookUrl') ? ctx.request.body.webhookUrl : area.webhookUrl;
        area.fireAlerts = updateKeys.includes('fireAlerts') ? ctx.request.body.fireAlerts : area.fireAlerts;
        area.deforestationAlerts = updateKeys.includes('deforestationAlerts') ? ctx.request.body.deforestationAlerts : area.deforestationAlerts;
        area.monthlySummary = updateKeys.includes('monthlySummary') ? ctx.request.body.monthlySummary : area.monthlySummary;
        area.subscriptionId = updateKeys.includes('subscriptionId') ? ctx.request.body.subscriptionId : area.subscriptionId;
        area.email = updateKeys.includes('email') ? ctx.request.body.email : area.email;
        area.language = updateKeys.includes('language') ? ctx.request.body.language : area.language;
        area.status = updateKeys.includes('status') ? ctx.request.body.status : area.status;
        if (files && files.image) {
            area.image = await s3Service.uploadFile(files.image.path, files.image.name);
        }
        if (typeof ctx.request.body.templateId !== 'undefined') {
            area.templateId = ctx.request.body.templateId;
        }
        area.updatedDate = Date.now;

        await area.save();
        ctx.body = AreaSerializerV2.serialize(area);
    }

    static async delete(ctx) {
        logger.info(`Deleting area with id ${ctx.params.id}`);
        const result = await AreaModel.deleteOne({ _id: ctx.params.id });
        if (!result || result.ok === 0) {
            ctx.throw(404, 'Area not found');
            return;
        }
        logger.info(`Area ${ctx.params.id} deleted successfully`);

        const userId = ctx.state.loggedUser.id;
        let team = null;
        try {
            team = await TeamService.getTeamByUserId(userId);
        } catch (e) {
            logger.error(e);
        }
        if (team && team.areas.includes(ctx.params.id)) {
            const areas = team.areas.filter((area) => area !== ctx.params.id);
            try {
                await TeamService.patchTeamById(team.id, { areas });
                logger.info('Team patched successful.');

            } catch (e) {
                logger.error(e);
            }
        }
        ctx.body = '';
        ctx.statusCode = 204;
    }

}

async function loggedUserToState(ctx, next) {
    if (ctx.query && ctx.query.loggedUser) {
        ctx.state.loggedUser = JSON.parse(ctx.query.loggedUser);
        delete ctx.query.loggedUser;
    } else if (ctx.request.body && ctx.request.body.loggedUser) {
        if (typeof ctx.request.body.loggedUser === 'object') {
            ctx.state.loggedUser = ctx.request.body.loggedUser;
        } else {
            ctx.state.loggedUser = JSON.parse(ctx.request.body.loggedUser);
        }
        delete ctx.request.body.loggedUser;
    } else if (ctx.request.body.fields && ctx.request.body.fields.loggedUser) {
        ctx.state.loggedUser = JSON.parse(ctx.request.body.fields.loggedUser);
        delete ctx.request.body.loggedUser;
    } else {
        ctx.throw(401, 'Not logged');
        return;
    }
    await next();
}

async function checkPermission(ctx, next) {
    ctx.assert(ctx.params.id, 400, 'Id required');
    const area = await AreaModel.findById(ctx.params.id);
    if (!area) {
        ctx.throw(404, 'Area not found');
        return;
    }
    if (area.userId !== ctx.state.loggedUser.id && area.userId !== ctx.request.body.userId && ctx.state.loggedUser.role !== 'ADMIN') {
        ctx.throw(403, 'Not authorized');
        return;
    }
    await next();
}

async function unwrapJSONStrings(ctx, next) {
    if (ctx.request.body.use && typeof ctx.request.body.use === 'string' && ctx.request.body.use.length > 0) {
        try {
            ctx.request.body.use = JSON.parse(ctx.request.body.use);
        } catch (e) {
            // not a JSON, ignore and move on
        }
    }
    if (ctx.request.body.iso && typeof ctx.request.body.iso === 'string' && ctx.request.body.iso.length > 0) {
        try {
            ctx.request.body.iso = JSON.parse(ctx.request.body.iso);
        } catch (e) {
            // not a JSON, ignore and move on
        }
    }

    await next();
}

const router = new Router({ prefix: '/area' });

router.get('/', loggedUserToState, AreaRouterV2.getAll);
router.post('/', loggedUserToState, unwrapJSONStrings, AreaValidatorV2.create, AreaRouterV2.save);
router.patch('/:id', loggedUserToState, checkPermission, unwrapJSONStrings, AreaValidatorV2.update, AreaRouterV2.update);
router.get('/:id', loggedUserToState, AreaRouterV2.get);
router.delete('/:id', loggedUserToState, checkPermission, AreaRouterV2.delete);

module.exports = router;
