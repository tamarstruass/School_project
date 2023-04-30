const dal = require('../dal/tests');
const course_student_dal = require('../dal/course_students');
const test_course_dal = require('../dal/test_courses');
const question_test_dal = require('../dal/question_tests');
const answer_dal = require('../dal/answers');
const question_dal = require('../dal/questions');
const course_student_ctrl = require('./course_student');

exports.findAll = async (req, res) => {
    await dal.findAll()
        .then(data => { res.send(data); })
        .catch(err => {
            res.status(500).send({ message: err.message || `Some Errors occured while retriving checked tests.` })
        });
}
exports.findOne = async (req, res) => {
    const id = req.params.id;
    await dal.findOne({ where: { id: id } })
        .then(data => {
            if (data)
                res.send(data);
            else res.status(500).send({ message: `Cannot find answer for checked_test by id: ${id}` })
        })
}
exports.findByCourseStudent = async (req, res) => {
    const id = req.params.id;
    await dal.findOne({ where: { courseStudentId: id } })
        .then(data => {
            if (data)
                res.send(data);
            else res.status(500).send({ message: `Cannot find checked_test by courseStudentId: ${id}` })
        })
}
exports.update = async (req, res) => {
    const id = req.body.id;
    await dal.update(req.body, id)
        .then(num => {
            if (num == 1)
                res.send({ message: 'CheckedTest for Student was updated successfully 👍.' })
            else {
                res.send({ message: `Cannot update CheckedTest for Student by id ${id}. Maybe CheckedTest was not found or req.body is empty!` })
            }
        })
}
exports.delete = async (req, res) => {
    await dal.delete(id)
        .then(num => {
            if (num == 1)
                res.send({ message: `CheckedTest was deleted successfully! 👍` })
            else res.send({ message: `Cannot delete CheckedTest with id ${id}. Maybe checked_test was not found!` })
        })
        .catch(err => {
            res.status(500).send({ message: `Could not delete checked_test with id ${id}` })
        })
}

exports.createTest = async (req, res) => {
    const courseStudentId = req.body.courseStudentId;
    console.log(courseStudentId);
    if (!courseStudentId) {
        return res.status(400).json({ message: "All fields are required" });
    }
    if (!course_student_ctrl.canTest(courseStudentId))
        return res.status(500).json({ message: `You have to view all lectures in order to test.` });
    const test = await dal.create({ courseStudentId: courseStudentId, date: new Date() });
    if (!test) return res.status(500).send('Failed to create a test');
    const courseStudent = await course_student_dal.findOne({ where: { id: courseStudentId } });
    const courseId = courseStudent.id;
    const questions = await question_dal.findAll({ where: { courseId: courseId } })
    if (!questions) return res.status(500).send('No questions found');
    const testCourse = await test_course_dal.findOne({ where: { courseId: courseId } });
    if (! testCourse) {
        res.send('error')
    }
    const numOfQuestions = testCourse.numOfQuestions;
    let rand = 0;
    let idx = [];
    for (let i = 0; i < numOfQuestions; i++) {
        rand = Math.floor(Math.random());
        while (idx.includes(rand)) {
            rand = Math.floor(Math.random() * questions.length)
        }
        idx.push(rand);
    }
    console.log(idx);
    console.log(test);
    let questionsTest = [];
    let maxScores = 0;
    for (let i = 0; i < idx.length; i++) {
        questionsTest.push({ testId: test.id, questionId: questions[idx[i]].id });
        maxScores += questions[idx[i]].scores;
        await question_test_dal.create({ testId: test.id, questionId: questions[idx[i]].id })
    }
    await dal.update({ id: test.id, courseStudentId: test.courseStudentId, date: test.date, scores: test.scores, maxScores: maxScores, secureVideo: test.secureVideo, isSubmitted: test.isSubmitted }, test.id);
    res.send(questionsTest);
}

const autoCheckTest = async (req, res) => {
    const questionsTest = req.body.test;
    if (!questionsTest) {
        res.send(`test cannot be empty`);
        return;
    }
    console.log(questionsTest);
    const testId = questionsTest[0].testId;
    let scores = 0;
    const test = await dal.findOne({ where: { id: testId } })
    console.log(questionsTest.length);
    for (let i = 0; i < questionsTest.length; i++) {
        const question = await question_dal.findOne({ where: { id: questionsTest[i].questionId } })
        if (question.isClosed) {
            const studentAnswer = questionsTest[i].answerText;
            const correctAnswer = await answer_dal.findOne({ where: { questionId: question.id, isCorrect: true } })
            if (studentAnswer == correctAnswer.text)
                scores += question.scores;
        };
        await question_test_dal.update({ id: questionsTest[i].id, testId: questionsTest[i].testId, questionId: questionsTest[i].questionId, answerText: questionsTest[i].answerText, isChecked: true },
            questionsTest[i].id);
    }
    scores = scores / test.maxScores * 100;
    console.log(`scores: ${scores}`);
    await dal.update({ id: test.id, courseStudentId: test.courseStudentId, date: test.date, scores: scores, maxScores: test.maxScores, secureVideo: test.secureVideo, isSubmitted: test.isSubmitted },
        test.id)
        .then(num => {
            if (num == 1) {
                res.json({ message: `Your scores: ${scores}` });
            }
            else res.send(`error in Checking this test`);
        })
}


exports.submitTest = async (req, res) => {
    const secureVideo = req.body.secureVideo;
    const questionsTest = req.body.test; // מערך שאלות של מבחן של תלמיד
    const testId = questionsTest[0].testId; // קוד רשומת המבחן לקורס לתלמיד
    for (let i = 0; i < questionsTest.length; i++) {
        question_test_dal.update(questionsTest[i], questionsTest[i].id)
    }
    await dal.findOne({ where: { id: testId } })
        .then(async test => {
            await dal.update({ id: test.id, courseStudentId: test.courseStudentId, date: test.date, scores: test.scores, maxScores: test.maxScores, secureVideo: secureVideo, isSubmitted: true },
                testId)
                .then(async num => {
                    console.log(num);
                    if (num == 1) {
                        // send to service of mark honesty
                        autoCheckTest(req, res);
                    }
                    else res.status(500).send(`Failed Submition`)
                })
        })
}

exports.numOfTestToCheck = async (req, res) => {
    const courseId = req.params.id;
    const questions = await question_dal.findAll({ where: { courseId: courseId, isClosed: false } })
    const questionsTests = [];
    for (i = 0; i < questions.length; i++) {
        const questionTest = await question_test_dal.findOne({ where: { questionId: questions[i].id, isChecked: false } });
        if (questionTest)
            questionsTests.push(questionTest);
    }
    return questionsTests.length;

}

exports.checkTest = async (req, res) => {
    const checkedTest = req.body.test;
    console.log(checkedTest);
    if (!checkedTest) {
        res.status(500).send(`Test cannot be empty`);
        return;
    }
    for (let i = 0; i < checkedTest.length; i++) {
        let _scores = checkedTest[i].scores;
        console.log(`_scores: ${_scores}`);
        await question_test_dal.update({ id: checkedTest[i].id, testId: checkedTest[i].testId, questionId: checkedTest[i].cquestionId, answerText: checkedTest[i].answerText, isChecked: true }, checkedTest[i].id);
        const test = await dal.findOne({ where: { id: checkedTest[i].testId } });
        if (test) {
            _scores = _scores / test.maxScores * 100 + test.scores;
            if (_scores != test.scores) {
                await dal.update({ id: test.id, courseStudentId: test.courseStudentId, date: test.date, scores: _scores, maxScores: test.maxScores, secureVideo: test.secureVideo, isSubmitted: test.isSubmitted }, test.id)
                    .then(num => {
                        if (num == 1) {
                            res.send(`Update successfully 👍`)
                        }
                        else res.status(500).send(`Error in updating test checking by teacher`);
                    })
            }
            else res.send({ message: `No Changes, maybe ans was not correct` })
        }
    }
}

exports.getTestsToCheck = async (req, res) => {
    const courseId = req.params.id;
    let questions = [];
    let arrTest = [];
    const courseStudents = await course_student_dal.findAll({ where: { courseId: courseId } })//מביא את כל התלמידים שרשומים לקורס המסויים
    if (!courseStudents)
        return res.status(500).json({ message: `Courses for students for courseID: ${courseId}` })
    console.log(courseStudents);
    for (let i = 0; i < courseStudents.length; i++) {
        const test = await dal.findOne({ where: { courseStudentId: courseStudents[i].id, isSubmitted: true } })//מביא את כל המבחן של התלמיד המסויים
        console.log(test);
        if (!test)
            return res.status(500).json({ message: `Error getting tests. Was not submitted yet.` })
        const questionsTest = await question_test_dal.findAll({ where: { testId: test.id, isChecked: 0 } })//מחזיר את השאלות שאינן בדוקות עוד של המבחן של התלמיד
        if (!questionsTest)
            return res.status(500).json({ message: `Error getting tests - questionsTest` });
        for (let i = 0; i < questionsTest.length; i++) {
            const question = await question_dal.findOne({ where: { id: questionsTest[i].questionId, isClosed: false } })
            if (question)
                questions.push(questionsTest[i]);
        }
        for (let i = 0; i < questions.length; i++) {
            const question = await question_dal.findOne({ where: { id: questions[i].questionId } });
            if (question)
                arrTest.push(question);
            const answer = await answer_dal.findOne({ where: { questionId: question.id, isCorrect: true } });
            if (answer)
                arrTest.push(answer);
        }
        while (i < questions.length - 1 && questions[i].questionId == questions[i + 1].questionId) {
            arrTest.push(questions[i++]);
        }
        console.log(`ArrTest`);
        console.log(arrTest);
        arrTest.push(questions[i]);
    }
    console.log(questions);
    res.send(arrTest);//מחזיר את מערך המבחנים של הקורס 
};