const Comment = require('../models/comment');
const Mark = require('../models/mark');
const Score = require('../models/score');
const CommentDAO = require('../services/dao/comment-dao');
const CoursesDAO = require('../services/dao/courses-dao');
const KnowledgeDAO = require('../services/dao/knowledge-dao');
const LessonDAO = require('../services/dao/lesson-dao');
const MarkDAO = require('../services/dao/mark-dao');
const ScoreDAO = require('../services/dao/score-dao');
const DateTime = require('../utils/datetime');
const Response = require('../utils/response');
const BaseController = require('./base-controller');
const LessonController = require('./lesson-controller');

class KnowledgeController extends BaseController{
    constructor(){
        super();
        this.lsnCtrl = new LessonController();
    }

    async checkAccessible(account, knowledge){
        if (knowledge == null) return false;
        let course = await CoursesDAO.getInstance().getById(knowledge.id);
        if (course) return true; // always able to access course
        return this.lsnCtrl.checkAccessible(account, await LessonDAO.getInstance().getById(knowledge.id));
    }

// middle ware:
    async checkKnowledgeExisted(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {knid} = req.params;
        let kn = await KnowledgeDAO.getInstance().getById(knid);
        if (!kn) return this.badRequest("Knowledge is not exist");
        req.knowledge = kn;
        next();
    }

    async checkCommentExisted(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {commentid} = req.params;
        let comment = await CommentDAO.getInstance().getById(commentid);
        if (!comment) return this.badRequest("Comment not existed");
        req.comment = comment;
        next();
    }

// endware

    // put api/knowledge/score/:knid
    // header: token
    // params: knid
    // body: score
    async scoreKnowledge(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {account, knowledge} = req;
        if (!await this.checkAccessible(account, knowledge))
            return this.info("No permission");
        let { score } = req.body;
        if (score != 0 && score != 1 && score != 2 && score != 3 && score != 4 && score != 5)
            return this.badRequest("Score is not valid");
        let scores = await ScoreDAO.getInstance().select({
            email: account.email,
            knowledge_id: knowledge.id
        });
        let rs = null, scoreObj = null;

        if (scores.length <= 0){ // insert
            scoreObj = new Score({
                email: account.email,
                knowledge_id: knowledge.id,
                score: score,
                time: DateTime.now()
            });
            rs = await ScoreDAO.getInstance().insert(scoreObj);
        } else { // update
            rs = await ScoreDAO.getInstance().update({
                score: score,
                time: DateTime.now()
            }, {
                email: account.email,
                knowledge_id: knowledge.id
            })
        }

        if (!rs) return this.serverError();
        return this.success("Success", scoreObj);
    }

    // post api/knowledge/comment
    // header: token (authorization)
    // params: knid
    // body: content
    async addComment(req, res, next){
        this.updateMiddleWare(req, res, next);
        let { account, knowledge } = req;
        if (!await this.checkAccessible(account, knowledge))
            return this.info("No permission");
        let { content } = req.body;
        if (content == null) return this.badRequest("Content cannot be null");
        let comment = new Comment({
            email: account.email,
            knowledge_id: knowledge.id,
            content: content,
            time: DateTime.now()
        })
        
        let rs = await CommentDAO.getInstance().insert(comment);
        if (!rs) return this.serverError();
        return this.success("Success", comment);
    }


    // patch api/knowledge/comment/:commentid
    // header: token
    // body: newContent
    async updateComment(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {account, comment} = req;
        if (comment.email != account.email) return this.info("Not permission");
        let {newContent} = req.body;
        if (newContent == null) return this.badRequest("newContent not be null");
        comment.content = newContent;
        comment.time = DateTime.now();

        let rs = await CommentDAO.getInstance().update({
            content: newContent,
            time: comment.time
        }, {
            id: comment.id
        });

        if (!rs) return this.serverError();
        return this.success("Success", comment);
    }

    // delete api/knowledge/comment/:id
    // header: token
    async deleteComment(req, res, next){
        this.updateMiddleWare(req, res, next);
        let { account, comment } = req;
        if (account.email != comment.email) return this.info("Not permission");
        
        let rs = await CommentDAO.getInstance().delete({
            id: comment.id
        });
        if (!rs) return this.serverError();
        return this.success("Success", comment);
    }

    // get api/knowledge/comment/:knid
    // body: offset*, length*
    async getListComments(req, res, next){
        this.updateMiddleWare(req, res, next);
        let { knowledge } = req;
        let {offset, length} = req.body;
        let pagination = null;
        if (offset && length){
            pagination = {
                offset: offset,
                length: length
            }
        };

        let comments = await CommentDAO.getInstance().selectDetail({
            knowledge_id: knowledge.id
        }, ["id", "comment.email as email", "avatar", "name", "content", "time"], pagination);

        if (comments == null) return this.serverError();
        comments = {
            length: comments.length,
            data: comments
        }
        return this.success("Success", comments);
    }

    // post api/knowledge/mark/:knid
    // header: token 
    // body: type: 0/1
    async setMark(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {account, knowledge} = req;
        let {type} = req.body;
        if (type != 0 && type != 1) return this.badRequest("Type is not valid");
        let marks = await MarkDAO.getInstance().select({
            email: account.email,
            knowledge_id: knowledge.id
        });
        let mark = marks ? marks[0] : null;
        let rs = null;
        if (type == 0){
            // unmark
            if (mark) { // delete
                rs = await MarkDAO.getInstance().delete({
                    email: account.email,
                    knowledge_id: knowledge.id
                });
            } else rs = true;
            if (!rs) return this.serverError("Unmark failed!");
            return this.success("Unmark success");
        }
        if (type == 1){
            // mark
            if (!mark){ // insert
                rs = await MarkDAO.getInstance().insert(new Mark({
                    email: account.email,
                    knowledge_id: knowledge.id,
                    time: DateTime.now()
                }))
            } else rs = true;
            if (!rs) return this.serverError("Mark failed!");
            return this.success("Mark success");
        }
        return this.serverError("Pass if else");
    }

    // get api/knowledge/mark/:knid*
    // header: token
    // body: offset*, length*
    async getListMark(req, res, next){
        this.updateMiddleWare(req, res, next);
        let {account} = req;
        let {knid} = req.query;
        let {offset, length} = req.body;
        let pagination = null;
        if (offset && length) pagination = {
            offset: offset, length: length
        }

        let marks = null;
        let keys = [
            "profile.email as email", "name", "avatar", "time", 
            "id", "id as knid", "thumbnail", "title", "owner_email", 
            "courses.knowledge_id as course_id", "lesson.knowledge_id as lesson_id"
        ];
        if (knid == null){
            // get Knowledge be marked
            marks = await MarkDAO.getInstance().selectDetail({
                "mark.email": account.email
            }, keys, pagination);
        } else if (knid != null){
            // check knowledge is exist and check permission
            let knowledge = await KnowledgeDAO.getInstance().getById(knid);
            if (!knowledge) return this.badRequest("knowledge is not exist");
            if (knowledge.owner_email != account.email)
                return this.info("Not permission");

            // get User marked this knowledge
            marks = await MarkDAO.getInstance().selectDetail({
                "mark.knowledge_id": knid
            }, keys, pagination);
        }
        // add properties for marks
        if (marks == null) return this.serverError();
        marks.forEach(mark => {
            mark.is_course = mark.course_id != null ? 1 : 0;
            mark.is_lesson = mark.lesson_id != null ? 1 : 0;
        });
        marks = {
            length: marks.length,
            data: marks
        }
        return this.success("Successs", marks);
    }
}

module.exports = KnowledgeController;