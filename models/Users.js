const { DataTypes } = require("sequelize");
const sequelize = require("../db");

// console.log(sequelize)
const User = sequelize.define("users", {
    phoneNumber: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    priority: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: ['0', '1', '2'] // Define the allowed values for priority
    },
    created_at: {
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
        beforeCreate: (user, options) => {
            user.created_at = new Date().toISOString().slice(0, 10); // Set created_at to current date
            user.updated_at = new Date().toISOString().slice(0, 10); // Set updated_at to current date
        },
        beforeUpdate: (user, options) => {
            user.updated_at = new Date().toISOString().slice(0, 10); // Update updated_at to current date
        }
    }
});


module.exports = User;

