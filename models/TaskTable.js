const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const TaskTable = sequelize.define("tasktable", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true // Assuming you want it to auto-increment
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false
    },
    due_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('TODO', 'IN_PROGRESS', 'DONE'), // Define ENUM values
        allowNull: false,
        defaultValue: 'TODO'
    },
    priority: {
        type: DataTypes.ENUM('0', '1', '2', '3'),
        allowNull: false,
        defaultValue: "0" // Default priority initially set to 0
    },
    deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    deleted_at: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null
    }, created_at: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: false, // Disable Sequelize's auto-managed timestamps
    hooks: {
        beforeCreate: (task, options) => {
            task.created_at = new Date().toISOString().slice(0, 10); // Set created_at to current date
            task.updated_at = new Date().toISOString().slice(0, 10); // Set updated_at to current date
            task.priority = calculatePriority(task)
        },
        beforeUpdate: (task, options) => {
            task.updated_at = new Date().toISOString().slice(0, 10); // Update updated_at to current date
            task.priority = calculatePriority(task)
        }
    }

});

// Function to calculate priority based on due date
const calculatePriority = (task) => {
    const today = new Date();
    const dueDate = new Date(task.due_date);
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysDiff < 0 || daysDiff === 0) {
        return "0"; // Due date is today
    } else if (daysDiff <= 2) {
        return "1"; // Due date is between tomorrow and day after tomorrow
    } else if (daysDiff <= 4) {
        return "2"; // Due date is within 3-4 days
    } else {
        return "3"; // Due date is 5 or more days away
    }
};

module.exports = TaskTable;
