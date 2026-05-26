import {
    _, db, Context, ObjectId, Handler, PRIV, PERM, ForbiddenError, param, Types, OplogModel,
    FileExistsError, TrainingModel, NotFoundError,
} from 'hydrooj';

const collTrainingCategory = db.collection('trainingcategory');

interface TrainingCategoryDoc {
    domainId: string,
    category: string;
    displayName: string;
    trainingIds: ObjectId[];
}
declare module 'hydrooj' {
    interface Model {
        trainingcategory: typeof TrainingCategoryModel;
    }
    interface Collections {
        trainingcategory: TrainingCategoryDoc;
    }
}

class TrainingCategoryModel {
    static coll = collTrainingCategory;

    static async add(domainId: string, category: string, displayName: string): Promise<ObjectId> {
        const result = await TrainingCategoryModel.coll.insertOne({ 
            domainId,
            category, 
            displayName,
            trainingIds: []
        });

        return result.insertedId;
    }

    static async getById(domainId: string, cid: ObjectId) {
        const result = await TrainingCategoryModel.coll.findOne({ domainId, _id: cid });
        return result;
    }

    static async getByName(domainId: string, category: string) {
        const result = await TrainingCategoryModel.coll.findOne({ domainId, category });
        return result;
    }

    static async getMulti(domainId: string) {
        const result = await TrainingCategoryModel.coll.find({ domainId });
        return result;
    }

    static async edit(domainId: string, cid: ObjectId, category: string, displayName: string): Promise<number> {
        const result = await TrainingCategoryModel.coll.updateOne(
            { _id: cid },
            { $set: { category, displayName } }
        );
        return result.modifiedCount;
    }

    static async del(domainId: string, cid: ObjectId): Promise<number> {
        const result = await TrainingCategoryModel.coll.deleteOne({ domainId, _id: cid });
        return result.deletedCount;
    }

    static async inc(domainId: string, category: string, trainingId: ObjectId) {
        const result = await TrainingCategoryModel.coll.updateOne(
            { domainId, category },
            { $push: { trainingIds: trainingId } } 
        );
        return result;
    }
}

global.Hydro.model.trainingcategory = TrainingCategoryModel;

class TrainingCategoryHandler extends Handler {
    ddoc?: TrainingCategoryModel;

    async _prepare({ domainId }, cid: ObjectId) {
        this.ddoc = await TrainingCategoryModel.getById(domainId, cid);
    }

    @param('category', Types.String)
    async get({ domainId }, category: string) {
        if (!this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            throw new ForbiddenError();
        }
        const cursor = await TrainingCategoryModel.getMulti(domainId);
        const ddocs = (await cursor.toArray()).toSorted((a, b) => a.category.localeCompare(b.category));

        const ddoc = await TrainingCategoryModel.getByName(domainId, category);

        const tdocs = ddoc.trainingIds && ddoc.trainingIds.length > 0
                    ? await TrainingModel.getMulti(domainId, { docId: { $in: ddoc.trainingIds } }).toArray()
                    : [];

        this.response.body = {
            ddoc, ddocs, tdocs, category,
        };
        this.response.template = 'training_main.html';
    }
}

class TrainingCategoryEditHandler extends Handler {
    async get({ domainId }) {
        if (!this.user.hasPerm(PERM.PERM_CREATE_TRAINING)) {
            throw new ForbiddenError();
        }
        const tdocs = await TrainingModel.getMulti(domainId).toArray();

        const cursor = await TrainingCategoryModel.getMulti(domainId);
        const ddocs = (await cursor.toArray()).toSorted((a, b) => a.category.localeCompare(b.category));
        this.response.body = {
            ddocs, tdocs,
        };
        this.response.template = 'training_category.html';
    }

    @param('category', Types.String)
    @param('displayName', Types.String)
    async postCreate({ domainId }, category: string, displayName: string) {
        if (!this.user.hasPerm(PERM.PERM_CREATE_TRAINING)) {
            throw new ForbiddenError();
        }

        const doc = await TrainingCategoryModel.getByName(domainId, category);
        if (doc) {
            throw new FileExistsError(category);
        }

        const result = await TrainingCategoryModel.add(domainId, category, displayName);
        this.response.body = { result };
        this.response.redirect = this.url('training_category_edit');
    }

    @param('cid', Types.ObjectId)
    @param('category', Types.String)
    @param('displayName', Types.String)
    async postUpdate({ domainId }, cid: ObjectId, category: string, displayName: string) {
        if (!this.user.hasPerm(PERM.PERM_CREATE_TRAINING)) {
            throw new ForbiddenError();
        }

        const doc = await TrainingCategoryModel.getByName(domainId, category);
        if (doc) {
            throw new FileExistsError(category);
        }

        const ddoc = await TrainingCategoryModel.getById(domainId, cid);
        const result = await Promise.all([
            TrainingCategoryModel.edit(domainId, cid, category, displayName),
            OplogModel.log(this, 'training.category.update', ddoc),
        ]) 
        this.response.body = { result };
        this.response.redirect = this.url('training_category_edit');
    }

    @param('category', Types.String)
    async postDelete({ domainId }, category: string) {
        if (!this.user.hasPerm(PERM.PERM_CREATE_TRAINING)) {
            throw new ForbiddenError();
        }
        const ddoc = await TrainingCategoryModel.getByName(domainId, category);
        if (!ddoc) {
            throw new NotFoundError(category);
        }

        await Promise.all([
            TrainingCategoryModel.del(domainId, ddoc._id),
            OplogModel.log(this, 'training.category.delete', ddoc),
        ]);
        this.response.redirect = this.url('training_category_edit');
    }

    @param('trainingId', Types.ObjectId)
    @param('category', Types.String)
    async postSubmit({ domainId }, trainingId: ObjectId, category: string) {
        if (!this.user.hasPerm(PERM.PERM_CREATE_TRAINING)) {
            throw new ForbiddenError();
        }

        await TrainingCategoryModel.inc(domainId, category, trainingId);
        this.response.redirect = this.url('training_category_edit');
    }
}

export async function apply(ctx: Context) {
    ctx.on('handler/after/TrainingMain#get', async (handler) => {
        try {
            // @ts-ignore
            const cursor = await TrainingCategoryModel.getMulti(handler.domain._id);
            const ddocs = (await cursor.toArray()).toSorted((a, b) => a.category.localeCompare(b.category));
            handler.response.body.ddocs = ddocs;
        } catch (e) {
            handler.response.body.ddocs = [];
        }
    });

    ctx.Route('training_category', '/category/:category', TrainingCategoryHandler);
    ctx.Route('training_category_edit', '/category', TrainingCategoryEditHandler);

    ctx.i18n.load('zh', {
        'Training Plans Category': '训练计划类别',
        'Manage Training Category': '管理训练类别',
        'View Training Plan': '查看训练计划',
        'Create Category': '新增类别',
        'All Category': '所有类别',
        'Delete Category': '删除类别',
        'Category': '分类',
        'No category available': '没有可用类别',
        'No training plans available': '没有可用训练',
        'Distribute Training Plans': '训练分类',
        'Click the button below to view training plans of specific category.': '点击下面的按钮即可查看该类别下的训练计划。',
        'Deleting a category will unclassify the training lists within it.': '删除类别后，该类别中的训练计划将处于未分类状态。',
        'To update the category ID or display name, please delete the original category and add it again.': '如需更新类别 ID 或展示名，请删除原类别后重新新增。',
    });
}
