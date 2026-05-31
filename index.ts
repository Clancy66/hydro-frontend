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
            { domainId, _id: cid },
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

    static async dec(domainId: string, category: string, trainingId: ObjectId) {
        const result = await TrainingCategoryModel.coll.updateOne(
            { domainId, category },
            { $pull: { trainingIds: trainingId } } 
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
        const tids: Set<ObjectId> = new Set();
        for (const tdoc of tdocs) tids.add(tdoc.docId);

        const tsdict = {};
        let tdict = {};
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            const enrolledTids: Set<ObjectId> = new Set();
            const tsdocs = await TrainingModel.getMultiStatus(domainId, {
                uid: this.user._id,
                $and: [{ docId: { $in: Array.from(tids) } }, { enroll: 1 }],
            }).toArray();
            for (const tsdoc of tsdocs) {
                tsdict[tsdoc.docId] = tsdoc;
                enrolledTids.add(tsdoc.docId);
            }
            for (const tid of tids) enrolledTids.delete(tid);
            if (enrolledTids.size) {
                tdict = await TrainingModel.getList(domainId, Array.from(enrolledTids));
            }
        }
        for (const tdoc of tdocs) tdict[tdoc.docId.toHexString()] = tdoc;
        this.response.template = 'training_main.html';
        this.response.body = {
            tdocs, tsdict, tdict, category, ddocs,
        };
    }
}

class TrainingCategoryEditHandler extends Handler {
    check(category: string): boolean {
        if (category.includes('/') || category.includes('\\') 
              || category.includes(':') || category.includes('*') 
              || category.includes('?') || category.includes('"') 
              || category.includes('<') || category.includes('>') 
              || category.includes('|') || category.includes(' ')) {
            return false;
        }
        return true;
    }

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

        if (!this.check(category)) {
            throw new ForbiddenError('Category 不允许包含 /\\:*?"<>| 以及空格等特殊字符');
        }

        const doc = await TrainingCategoryModel.getByName(domainId, category);
        if (doc) {
            throw new FileExistsError(category);
        }

        const result = await TrainingCategoryModel.add(domainId, category, displayName);
        this.response.body = { result };
        this.response.redirect = this.url('training_category_edit');
    }

    // 更新类别
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
        else if (!this.check(category)) {
            throw new ForbiddenError('Category 不允许包含 /\\:*?"<>| 以及空格等特殊字符');
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

        const cursor = await TrainingCategoryModel.getMulti(domainId);
        const ddocs = (await cursor.toArray()).toSorted((a, b) => a.category.localeCompare(b.category));
        for (const ddoc of ddocs) {
            if (ddoc.trainingIds?.some(tid => tid.equals(trainingId))) {
                await TrainingCategoryModel.dec(domainId, ddoc.category, trainingId);
            }
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
        'Update Category': '更新类别',
        'Delete Category': '删除类别',
        'Category': '分类',
        'Not Selected': '未选择',
        'No category available': '没有可用类别',
        'No training plans available': '没有可用训练',
        'Distribute Training Plans': '训练分类',
        'Click the button below to view training plans of specific category.': '点击下面的按钮即可查看该类别下的训练计划。',
        'Category ID must be unique, it is recommended to use a valid identifier. The training homepage will display categories in dictionary order based on their IDs.': '类别 ID 需唯一，建议使用合法标识符，训练首页展示时会按照类别 ID 字典序展示。',
        'Set category tags for training problem sets. To change the category, just recategorize.': '给训练题单设置类别标签，如需更改类别，只需要重新分类即可。',
        'Deleting a category will unclassify the training lists within it.': '删除类别后，该类别中的训练计划将处于未分类状态。',
        'You can update the category ID or display name, or both.': '可以更新类别 ID 或展示名，也可以同时更新。',
    });
}
