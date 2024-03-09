const jwt = require("jsonwebtoken")
const jwt_key = "12345"

const validateUser = (req, res, next) => {

    const token = req.header("auth-token")
    if (!token) {
        return res.status(401).send("Access Denied!!")
    }

    try {
        const data = jwt.verify(token, jwt_key)
        req.user = data.user
    } catch (error) {
        return res.status(401).send("Access Denied!!")
    }
    next();
}

module.exports = validateUser