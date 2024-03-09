const express = require("express")
const router = express.Router()
const validateUser = require("../middleware/validateUser")
const SubTask = require("../models/SubTask")
const TaskTable = require("../models/TaskTable")
const cron = require("node-cron")
const User = require("../models/Users")
const twilio = require('twilio');
const { Op } = require('sequelize');

const VoiceResponse = require("twilio/lib/twiml/VoiceResponse")

// Twilio credentials
const accountSid = "YOUR_TWILIO_ACCOUNT_SID";
const authToken = "YOUR_TWILIO_AUTH_TOKEN";
const twilioClient = new twilio(accountSid, authToken);
let callStatuses = {};

const makeCall = async (userPhoneNumber) => {
    try {
        const twiml = new VoiceResponse();

        twiml.say(`Hello, this is a reminder for your overdue tasks. Please check your task list that is sent to you through SMS.`);
        const made = await twilioClient.calls.create({
            method: 'GET',
            twiml: twiml.toString(),
            to: "+91" + userPhoneNumber,
            from: '+15412554826',
            statusCallback: 'https://5cf6-2401-4900-1c06-5f1d-e0c6-b489-f73a-6e22.ngrok-free.app/api/tasks/twilio/status', // Replace with your server endpoint
            statusCallbackEvent: ['completed'],
            statusCallbackMethod: 'POST'
        });

        console.log(`Call initiated to ${userPhoneNumber}`);
        return true; // Call successful
    } catch (error) {
        console.error(`Failed to call ${userPhoneNumber}`);
        return false; // Call failed
    }
}

const sendMessage = async (userPhoneNumber, overdueTasks) => {
    try {
        const overdueTasksList = overdueTasks.map((task) => {
            return task.id
        })
        // console.log(overdueTasksList)
        const message = await twilioClient.messages.create({
            body: `Hello, this is a reminder for your overdue tasks with id's: ${overdueTasksList.join(', ')}.`,
            from: '+15412554826',
            to: "+91" + userPhoneNumber,
        });
        // console.log(message)

        console.log(`Message sent to ${userPhoneNumber}`);
        return true; // Message sent successfully
    } catch (error) {
        console.error(`Failed to send message to ${userPhoneNumber}`);
        return false; // Message sending failed
    }
}

// Function to handle voice call scheduling
const scheduleVoiceCalls = async (overdueTasks) => {
    try {
        // console.log("calling.")
        // Retrieve users by priority
        const users = await User.findAll({
            order: [['priority', 'ASC']], // Sort users by priority in ascending order
        });


        let callMade = false;
        // Loop through users
        for (const user of users) {
            // Attempt to call user
            const callInitiated = await makeCall(user.phoneNumber);
            if (callInitiated) {
                while (!callStatuses["+91" + user.phoneNumber]) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
                }
                // Check if call was answered
                if (callStatuses["+91" + user.phoneNumber] === 'completed') {
                    await sendMessage(user.phoneNumber, overdueTasks)
                    callMade = true
                    break;// Move to the next task if call was answered
                }
            }
        }
        if (!callMade) {
            console.log(`No users available to call`);
        }
        callStatuses = {}

    } catch (error) {
        console.error("Error scheduling voice calls:", error);
    }
}



// Method for updating the task status
const updateTaskStatus = async (taskId) => {
    try {
        // Finding the main task corresponding to the sub task
        const task = await TaskTable.findOne({
            where: {
                id: taskId,
                deleted: false
            }
        });
        // console.log(task)

        // Finding all the sub tasks corresponding to the main task
        const subTasks = await SubTask.findAll({ where: { task_id: taskId, deleted: false } });


        // Checking if all subtask is completed
        const allCompleted = subTasks.every(subTask => subTask.status === "1");

        // Checking if at least one subtask is completed
        const inProgress = subTasks.some(subTask => subTask.status === "1");

        // Updating the task status based on subtask completion
        // If there are no subtasks then default value for the main task will be TODO
        if (!subTasks.length) {
            task.status = "TODO";
        }
        else if (allCompleted) {
            task.status = "DONE";
        } else if (inProgress) {
            task.status = "IN_PROGRESS";
        } else {
            task.status = "TODO";
        }

        // Saved the updated task status
        await task.save();
    } catch (error) {
        console.log("Error updating task status")
    }
};

// Method for updating the task priority 
const updateTaskPriority = async () => {
    try {

        // Get the today's date to compare with the due date
        const today = new Date()

        // Retreiving all the tasks
        const tasks = await TaskTable.findAll({
            where: {
                deleted: false
            }
        });


        for (let task of tasks) {
            const due_date = new Date(task.due_date);
            const timeDiff = due_date.getTime() - today.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

            if (daysDiff < 0 || daysDiff === 0) {
                task.priority = "0"; // Due date is today or Due date is already passed out
            } else if (daysDiff <= 2) {
                task.priority = "1"; // Due date is between tomorrow and day after tomorrow
            } else if (daysDiff <= 4) {
                task.priority = "2"; // Due date is within 3-4 days
            } else {
                task.priority = "3"; // Due date is 5 or more days away
            }

            await task.save();
        }

    } catch (error) {
        console.log("Error updating task priority")
    }
};

router.post("/twilio/status", async (req, res) => {
    try {
        // console.log(req)
        const callToNumber = req.body.To;
        const callStatus = req.body.CallStatus;
        // Store the call status in the global variable
        callStatuses[callToNumber] = callStatus;
        console.log("call : ", callStatuses)
        res.sendStatus(200); // Respond to Twilio with a success status
    } catch (error) {
        res.sendStatus(500)
    }
})

// Route for creating a task with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/addtask
router.post("/addtask", validateUser, async (req, res) => {

    try {
        const errors = []
        // Custom Input Validations
        // Date Format -> YYYY-MM-DD
        const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/
        const { title, description, due_date } = req.body
        if (!title) {
            errors.push("title is required")
        }
        if (!description) {
            errors.push("description is required")
        }
        if (!due_date) {
            errors.push("due_date is required")
        }
        else if (!dateFormatRegex.test(due_date) || isNaN((new Date(due_date)).valueOf())) {
            errors.push("Enter a valid date in the format YYYY-MM-DD")
        }
        if (errors.length) {
            return res.status(400).json({ success: false, errors })
        }
        // Creating new task
        const newTask = await TaskTable.create({
            title, description, due_date
        })
        res.json({ success: true, newTask })
        await checkOverdueTasksAndCall()
    } catch (error) {
        res.status(500).send("Internal Server Error")
    }
})


// Route for retreiveing tasks based on proper filters for priority,due_date,status,deleted and proper pagination with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/gettasks?priority=1&status=TODO&due_date=2024-03-10&deleted=true&page=1&limit=2
router.get("/gettasks", validateUser, async (req, res) => {
    try {
        const errors = []
        // Custom Input Validations
        // Date Format -> YYYY-MM-DD
        const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/
        const { priority, due_date, status, deleted } = req.query;

        // checks if the page param is present or not if its present is it a number or not. if it's not present it will give default value of 1
        const page = req.query.page !== undefined ? isNaN(req.query.page) ? errors.push("Enter a valid page number") : parseInt(req.query.page) : 1;
        // checks if the limit param is present or not if its present is it a number or not. if it's not present it will give default value of 10
        const limit = req.query.limit !== undefined ? isNaN(req.query.limit) ? errors.push("Enter a valid page size (limit)") : parseInt(req.query.limit) : 10;

        // To retreive only records that are not deleted
        const query = { deleted: false };
        if (priority && ['0', '1', '2', '3'].includes(priority.toString())) {
            query.priority = priority;
        } else if (priority) {
            errors.push("Please enter a valid priority number. Priority must be one of the following: 0, 1, 2, or 3.");
        }

        if (due_date && dateFormatRegex.test(due_date) && !isNaN(new Date(due_date).valueOf())) {
            query.due_date = due_date;
        } else if (due_date) {
            errors.push("Enter a valid date in the format YYYY-MM-DD");
        }

        if (status && ['TODO', 'IN_PROGRESS', 'DONE'].includes(status)) {
            query.status = status;
        } else if (status) {
            errors.push('Please enter a valid status value. Status must be one of the following: TODO, IN_PROGRESS, or DONE.');
        }

        if (deleted !== undefined) {
            const boolDeleted = deleted === "true" || deleted === "1";
            if (boolDeleted || deleted === "false" || deleted === "0") {
                query.deleted = boolDeleted ? 1 : 0;
            } else {
                errors.push('Please enter a valid boolean value for deleted');
            }
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }

        // Fetch tasks base on the filters provided
        const tasks = await TaskTable.findAndCountAll({
            where: query,
            limit: limit,
            offset: (page - 1) * limit
        });

        // Calculating total pages for pagination
        const totalPages = Math.ceil(tasks.count / limit);

        // Returned tasks and pagination metadata
        return res.json({
            tasks: tasks.rows,
            currentPage: page,
            totalPages: totalPages
        });


    } catch (error) {
        console.log(error)
        res.status(500).send("Internal Server Error");
    }
})

// Route for creating a subtask with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/addsubtask
router.post("/addsubtask", validateUser, async (req, res) => {
    try {
        const errors = []
        const { task_id } = req.body

        if (!task_id) {
            errors.push("task_id is required")
        }
        else if (isNaN(task_id)) {
            errors.push("Enter a valid task_id")
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }

        // To retreive the main task based ont the task_id which is not deleted
        const mainTask = await TaskTable.findOne({
            where: {
                id: task_id,
                deleted: false
            }
        })

        if (!mainTask) {
            return res.status(404).send("Task not found with the given task_id!!")
        }


        // Creating new sub task
        const newSubTask = await SubTask.create({
            task_id: req.body.task_id
        })

        // Updating the status of the main task as a new sub task has been added to it

        await updateTaskStatus(task_id)
        res.json(newSubTask)

    } catch (error) {
        console.log(error)
        res.status(500).send("Internal Server Error")
    }
})

// Route for retreiveing sub tasks based on proper filters for task_id,status,deleted and proper pagination with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/getsubtasks?task_id=2&status=0&deleted=true
router.get("/getsubtasks", validateUser, async (req, res) => {

    try {
        const errors = []
        const { status, deleted, task_id } = req.query

        const page = req.query.page !== undefined ? isNaN(req.query.page) ? errors.push("Enter a valid page number") : parseInt(req.query.page) : 1;
        const limit = req.query.limit !== undefined ? isNaN(req.query.limit) ? errors.push("Enter a valid page size (limit)") : parseInt(req.query.limit) : 10;


        const query = { deleted: false };

        if (status && ['0', '1'].includes(status)) {
            query.status = status;
        } else if (status) {
            errors.push('Please enter a valid status value. Status must be one of the following: 0(Incomplete), 1(Complete)');
        }
        if (task_id && !isNaN(task_id)) {
            query.task_id = task_id
        }
        else if (task_id) {
            errors.push("Enter a valid task_id")
        }

        if (deleted !== undefined) {
            const boolDeleted = deleted === "true" || deleted === "1";
            if (boolDeleted || deleted === "false" || deleted === "0") {
                query.deleted = boolDeleted ? 1 : 0;
            } else {
                errors.push('Please enter a valid boolean value for deleted');
            }
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const subTasks = await SubTask.findAndCountAll({
            where: query,
            limit: limit,
            offset: (page - 1) * limit
        })

        const totalPages = Math.ceil(subTasks.count / limit)

        return res.json({
            subTasks: subTasks.rows,
            currentPage: page,
            totalPages: totalPages
        })
    } catch (error) {
        res.status(500).send("Internal Server Error")
    }
})

// Route for updating task with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/updatetask/taskId=2
router.put("/updatetask/taskId=:taskId", validateUser, async (req, res) => {
    try {
        const errors = []
        const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/
        const { taskId } = req.params
        const { due_date, status } = req.body
        // console.log(isNaN(taskId))
        if (!taskId) {
            errors.push("taskId is required")
        }
        else if (isNaN(taskId)) {
            errors.push("Enter a valid taskId")
        }

        if (status && !['TODO', 'DONE'].includes(status)) {
            errors.push('Please enter a valid status value. Status must be one of the following: TODO, or DONE.');
        }

        if (due_date) {
            if (!dateFormatRegex.test(due_date) || isNaN(new Date(due_date).valueOf())) {
                errors.push("Enter a valid date in the format YYYY-MM-DD");
            }
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const task = await TaskTable.findOne({
            where: {
                id: taskId,
                deleted: false
            }
        });
        if (!task) {
            return res.status(404).send("No task found with the given taskId");
        }


        // Updating all the subtasks to 0 if the main task is marked as TODO and 1 if the main task is marked as DONE as per give requirements
        if (status === "TODO") {
            await SubTask.update({
                status: '0'
            }, {
                where: {
                    task_id: taskId
                }
            })
        } else if (status === "DONE") {
            await SubTask.update({
                status: '1'
            }, {
                where: {
                    task_id: taskId
                }
            })
        }

        await task.update({
            due_date: due_date,
            status: status
        });
        res.json({ success: true, message: "Task updated successfully" });
        await checkOverdueTasksAndCall()
    } catch (error) {
        res.status(500).send("Internal Server Error")
    }
})

// Route for updating sub task with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/updatesubtask/subTaskId=2
router.put("/updatesubtask/subTaskId=:subTaskId", validateUser, async (req, res) => {

    try {
        const errors = []
        const { subTaskId } = req.params
        const { status } = req.body

        if (!subTaskId) {
            errors.push("subTaskId is required")
        }
        else if (isNaN(subTaskId)) {
            errors.push("Enter a valid subTaskId")
        }


        if (status && !['0', '1'].includes(status)) {
            errors.push('Please enter a valid status value. Status must be one of the following: 0(Incomplete), 1(Complete)');
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const subTask = await SubTask.findOne({
            where: {
                id: subTaskId,
                deleted: false
            }
        })

        if (!subTask) {
            return res.status(404).send("No sub task found with the given subTaskId");
        }

        await subTask.update({
            status: status
        })

        // Updating the status of the main task as there is an update in the sub task 
        await updateTaskStatus(subTask.task_id)
        res.json({ success: true, message: "Sub task updated successfully" });
    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

// Route for deleting a task with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/deletetask/taskId=1
router.delete("/deletetask/taskId=:taskId", validateUser, async (req, res) => {
    try {
        const errors = []
        const { taskId } = req.params
        if (!taskId) {
            errors.push("taskId is required")
        }
        else if (isNaN(taskId)) {
            errors.push("Enter a valid taskId")
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const task = await TaskTable.findOne({
            where: {
                id: taskId,
                deleted: false
            }
        })

        if (!task) {
            return res.status(404).send("Task not found with the given taskId")
        }

        // Only marking all the sub tasks as deleted (Soft Deletion) as per given requirements
        await SubTask.update({
            deleted: true,
            deleted_at: new Date().toISOString().slice(0, 10)
        }, {
            where: {
                task_id: taskId
            }
        }
        )
        // Only marking the task as deleted (Soft Deletion) as per given requirements
        await task.update({
            deleted: true,
            deleted_at: new Date().toISOString().slice(0, 10)
        })

        res.json({ success: true, message: "Task deleted successfully(Soft Deletion)" });
    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

// Route for deleting a sub task with validateUser middleware which will verify the jwt token that is present in the request header
// Sample : http://localhost:5000/api/tasks/deletesubtask/subTaskId=a
router.delete("/deletesubtask/subTaskId=:subTaskId", validateUser, async (req, res) => {

    try {
        const errors = []
        const { subTaskId } = req.params

        if (!subTaskId) {
            errors.push("subTaskId is required")
        }
        else if (isNaN(subTaskId)) {
            errors.push("Enter a valid subTaskId")
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const subTask = await SubTask.findOne({
            where: {
                id: subTaskId,
                deleted: false
            }
        })

        if (!subTask) {
            return res.status(404).send("Sub task not found with the given subTaskId")
        }
        // Only marking the sub task as deleted (Soft Deletion) as per given requirements
        await subTask.update({
            deleted: true,
            deleted_at: new Date().toISOString().slice(0, 10)
        })

        // Updating the status of the main task as there is an update in the sub task 
        await updateTaskStatus(subTask.task_id)
        res.json({ success: true, message: "Sub task deleted successfully(Soft Deletion)" });
    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

router.post("/createuser", validateUser, async (req, res) => {
    try {

        const errors = []
        // Regular expression to validate phone number format (10 digits)
        const phoneRegex = /^\d{10}$/;

        const { phoneNumber, priority } = req.body
        if (!phoneNumber) {
            errors.push("phoneNumber is required")
        } else if (!phoneRegex.test(phoneNumber)) {
            errors.push("Enter a valid 10-digit phoneNumber");
        }


        if (priority === undefined) {
            errors.push("priority is required")
        } else if (!['0', '1', '2'].includes(priority)) {
            errors.push("Enter a valid priority ")
        }


        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }

        const newUser = await User.create(({
            phoneNumber, priority
        }))

        res.json({ success: true, newUser })
    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

router.get("/getusers", validateUser, async (req, res) => {
    try {
        const errors = []
        const { priority, user_id } = req.query

        const page = req.query.page !== undefined ? isNaN(req.query.page) ? errors.push("Enter a valid page number") : parseInt(req.query.page) : 1;
        const limit = req.query.limit !== undefined ? isNaN(req.query.limit) ? errors.push("Enter a valid page size (limit)") : parseInt(req.query.limit) : 10;


        const query = {}
        if (priority && ['0', '1', '2'].includes(priority.toString())) {
            query.priority = priority;
        } else if (priority) {
            errors.push("Please enter a valid priority number. Priority must be one of the following: 0, 1, or 2.");
        }
        if (user_id && !isNaN(user_id)) {
            query.id = user_id
        }
        else if (user_id) {
            errors.push("Enter a valid user_id")
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }

        const users = await User.findAndCountAll({
            where: query,
            limit: limit,
            offset: (page - 1) * limit
        })

        const totalPages = Math.ceil(users.count / limit)

        return res.json({
            users: users.rows,
            currentPage: page,
            totalPages: totalPages
        })

    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

router.put("/updateuser/user_id=:user_id", validateUser, async (req, res) => {
    try {
        const errors = []
        const { user_id } = req.params
        const { priority } = req.body

        if (!user_id) {
            errors.push("user_id is required")
        }
        else if (isNaN(user_id)) {
            errors.push("Enter a valid user_id")
        }


        if (priority && !['0', '1', '2'].includes(priority)) {
            errors.push("Please enter a valid priority number. Priority must be one of the following: 0, 1, or 2.");
        }

        if (errors.length) {
            return res.status(400).json({ success: false, errors });
        }


        const user = await User.findOne({
            where: {
                id: user_id,
            }
        })

        if (!user) {
            return res.status(404).send("No sub task found with the given subTaskId");
        }

        await user.update({
            priority
        })

        res.json({ success: true, message: "User updated successfully" });
    } catch (error) {
        res.status(500).send("Internal server error")
    }
})

// Schedule the cron job to run every day at 12:00 AM
// This will make sure to update the priority of the task everyday as per given requirements
cron.schedule('0 0 * * *', async () => {
    console.log('Running cron job at 12:00 AM...');
    await updateTaskPriority();
});

const checkOverdueTasksAndCall = async () => {
    const overdueTasks = await TaskTable.findAll({
        where: {
            due_date: {
                [Op.lt]: new Date(), // Due date is in the past
            },
            status: { [Op.ne]: 'DONE' }, // Exclude completed tasks
            deleted: false, // Task is not deleted
        },
    })

    if (overdueTasks.length) {
        console.log("Overdue Tasks Present. scheduling calls...")
        await scheduleVoiceCalls(overdueTasks);
    }
    else {
        console.log("Overdue Tasks Not Present...")
    }

}

cron.schedule('0 9 * * *', async () => {
    console.log('Running cron job at 09:00 AM...');
    // Retrieve overdue tasks
    await checkOverdueTasksAndCall()
});



module.exports = router

