const { DataTypes } = require("sequelize");
// Assuming your Task model is defined elsewhere
const TaskTable = require('./TaskTable');
const sequelize = require("../db");

const SubTask = sequelize.define("sub_task", {
    task_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('0', '1'),
        allowNull: false,
        defaultValue: '0'
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
        beforeCreate: (subtask, options) => {
            subtask.created_at = new Date().toISOString().slice(0, 10); // Set created_at to current date
            subtask.updated_at = new Date().toISOString().slice(0, 10); // Set updated_at to current date
        },
        beforeUpdate: (subtask, options) => {
            subtask.updated_at = new Date().toISOString().slice(0, 10); // Update updated_at to current date
        }
    }
})

// Define the relationship
SubTask.belongsTo(TaskTable, {
    foreignKey: 'task_id', // Custom foreign key name
    onDelete: 'CASCADE', // Specify ON DELETE behavior
    onUpdate: 'CASCADE' // Specify ON UPDATE behavior
});

TaskTable.hasMany(SubTask, {
    foreignKey: 'task_id' // Same custom foreign key name
});

module.exports = SubTask;
