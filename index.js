const express = require("express")
const app = express()
const cors = require("cors")
const PORT = 5000
const db = require("./db")
const Users = require("./models/Users")
const SubTask = require("./models/SubTask")
const TaskTable = require("./models/TaskTable")

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }));
// Application level middleware

app.use("/api/tasks", require("./routes/tasks"))

const initApp = async () => {
    console.log("Testing the database connection..");

    // Test the connection.
    try {
        await db.authenticate();
        console.log("Connection has been established successfully.");
        /**
         * Start the web server on the specified port.
         */
        // Syncronize the Book model.
        await Users.sync({ alter: true });
        await TaskTable.sync({ alter: true });
        await SubTask.sync({ alter: true });

        app.listen(PORT, () => {
            console.log(`openinAPP_Task_APP is listening on http://localhost:${PORT}`)
        })
    } catch (error) {
        console.error("Unable to connect to the database:", error.original);
    }
};

initApp()

