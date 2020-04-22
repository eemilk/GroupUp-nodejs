require('dotenv').config()
const express = require('express')
const app = express()
const mysql = require('mysql')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const async = require('async')

/*--------------- SETUP ----------------------------*/
const PORT = /*supersecret*/

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.json())

// MySQL connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset : 'utf8mb4'
})
connection.connect(function (err) {
    if (err) throw err
    console.log("Connected to database")
})

app.listen(PORT, () => {
    console.log(`Server running at ${PORT}`)
})



/*------------------- ROUTES ---------------------*/
//Login request
app.post('/api/login', (req, res) => {
    console.log(req.body)
    let email = req.body.email
    let password = req.body.password
    const user = { email: req.body.email }

    if (email && password) {
        // Check if user is found with email on request
        connection.query('SELECT * FROM User WHERE email = ?', [email], (err, results, fields) => {
            if (err) throw err
            if (results.length > 0) {
                console.log("User found")
                const userId = results[0].idUser
                const nickname = results[0].nickname

                bcrypt.hash(password, 10, function (err, hash) {
                    if (err) throw err
                    //Check if hashed password is same
                    bcrypt.compare(password, results[0].password, (err, result) => {
                        console.log(result)
                        if (err) throw err
                        if (result) {
                            jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, (err, token) => {
                                if (err) { throw err }
                                res.json({
                                    message: "LOGIN_OK",
                                    token: token,
                                    idUser: userId,
                                    nickname: nickname
                                })
                            })
                        }
                        else {
                            res.json({
                                message: "Email and password not correct"
                            })
                        }
                    })
                })

            } else {
                console.log('User not found')
                res.json({
                    message: "User not found"
                })
            }
        })
    }
    else {
        res.json({
            message: "Please type email and password"
        })
    }
})

//Create account
app.post('/api/create/user', async (req, res) => {
    try {
        // Encrypt password
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        console.log(hashedPassword)

        const user = {
            nickname: req.body.nickname,
            email: req.body.email,
            password: hashedPassword
        }

        // Check if email already exists
        connection.query('SELECT * FROM User WHERE email = ?', [user.email], (err, results, fields) => {
            if (err) throw err
            if (results.length != 0) {
                console.log("Email already exists")
                res.status(200).json({
                    message: "Email already exist",
                    statusCheck: "STATUS_EMAIL_EXISTS"
                })
            }
            else {
                // Creates new user
                connection.query('INSERT INTO User SET ?', user, (err, results) => {
                    if (err) throw err
                    console.log('Inserted:', results.nickname, results.idUser)
                    res.status(200).json({
                        message: "User created!",
                        statusCheck: "STATUS_OK"
                    })
                })
            }
        })
    } catch {
        res.status(500).send()
    }
})

//Create event
app.post('/api/create/event', (req, res) => {
    try {
        idGroups = req.body.idGroup
        EventName = req.body.EventName
        EventStartDate = req.body.EventStartDate
        EventEndDate = req.body.EventEndDate
        EventStartTime = req.body.EventStartTime
        EventEndTime = req.body.EventEndTime
        EventLocation = req.body.EventLocation
        EventInfo = req.body.EventInfo

        const sqlCreateEvent = 'CALL createEvent(?,?,?,?,?,?,?,?)'

        connection.query('SELECT idGroups FROM Groups WHERE idGroups = ?', [idGroups], (err, results) => {
            if (err) throw err
            if (results.length != 0) {
                connection.query(sqlCreateEvent, [idGroups, EventName, EventStartDate, EventEndDate, EventStartTime,
                    EventEndTime, EventLocation, EventInfo], (err, results) => {
                        if (err) { throw err }
                        console.log(results)
                        res.status(200).send("Event created!")
                    })
            }
            else {
                res.status(200).send("No groups found with this idGroup!")
            }
        })
    } catch {
        res.status(500).send()
    }
})

// Creates new group
app.post('/api/create/group', (req, res) => {
    try {
        const groupName = req.body.GroupName
        const userEmail = req.body.email
        const sqlNewGroup = 'CALL newGroup(?, ?)'
        const sqlAddToGroup = 'CALL addToGroup(?, ?)'
        let groupId
        let userId
        console.log("debug")
        let randomPassword = "#" + Math.random().toString(36).substring(6)
        let groupPassword = groupName + randomPassword

        connection.query(sqlNewGroup, [groupName, groupPassword], (err, results, fields) => {
            if (err) throw err
            groupId = results[0][0].idGroups

            connection.query('SELECT idUser FROM User WHERE email = ?', [userEmail], (err, result, fields) => {
                if (err) throw err
                userId = result[0].idUser

                connection.query(sqlAddToGroup, [groupId, userId], (err, results, fields) => {
                    if (err) throw err
                    res.status(200).json({
                        "CreateGroupResponse": [{
                            message: 'Group created!',
                            groupPassword: groupPassword,
                            idGroup: groupId
                        }]
                    })
                })
            })
        })
    } catch {
        res.status(500).send()
    }
})


//Sends groups specific to the user
app.post('/api/user/groups', (req, res) => {
    try {
        let emailUser = req.body.email
        const sqlGetUserGroups = 'CALL getUserGroups(?)'

        connection.query('SELECT idUser FROM User WHERE email = ?', [emailUser], (err, result, fields) => {
            if (err) throw err
            let idUser = result[0].idUser

            connection.query(sqlGetUserGroups, [idUser], (err, results, fields) => {
                if (err) throw err
                console.log(results[0])
                if (results.length > 0) {
                    res.status(200).json({
                        "UsersGroups":
                            results[0]
                    })
                }
                else {
                    res.status(200).send('No groups found with this email')
                }
            })
        })
    } catch {
        res.status(500).send()
    }
})


//Sends events specific to the searched user
app.post('/api/user/events', async (req, res) => {
    try {
        const emailUser = req.body.email
        const sqlGetUserEvents = 'CALL getUserEvents(?)'


        connection.query('SELECT idUser FROM User WHERE email = ?', [emailUser], (err, result, fields) => {
            if (err) throw err
            let idUser = result[0].idUser
            if (result.length > 0) {
                connection.query(sqlGetUserEvents, [idUser], (err, results, fields) => {
                    if (err) throw err
                    if (results.length > 0) {
                        getUserEvents(results, idUser, function (data) {
                            res.json({
                                "UsersEvents":
                                    data
                            })
                        })
                    }
                    else {
                        res.status(200).send('No events found with this email')
                    }
                })
            } else {
                res.status(500).send('No email found')
            }
        })

    } catch {
        res.status(500).send()
    }

    const getUserEvents = (sentResults, sentIdUser, callback) => {
        const sqlGetInParticipants = 'CALL getInParticipants(?)'
        const sqlGetOutParticipants = 'CALL getOutParticipants(?)'
        let responseJSON = new Object()
        responseJSON = sentResults[0]
        async.forEachOf(sentResults[0], function (value, key, callback) {
            let eventId = sentResults[0][key].idEvent

            connection.query('SELECT groupName FROM Groups WHERE idGroups = (SELECT idGroup FROM GroupEvents WHERE idEvent = ?)',
                [eventId], (err, result, fields) => {
                    if (err) throw err
                    responseJSON[key]["groupName"] = result[0].groupName

                    connection.query(sqlGetInParticipants, [eventId], (err, result) => {
                        if (err) throw err
                        console.log("processing")
                        responseJSON[key]["numberOfParticipants"] = result[0][0].numberOfParticipants

                        connection.query(sqlGetOutParticipants, [eventId], (err, result) => {
                            if (err) throw err
                            responseJSON[key]["numberOfParticipantsOut"] = result[0][0].numberOfParticipants

                            connection.query('SELECT Entrant FROM Participants WHERE idUser = ? AND idEvent = ?', [sentIdUser, eventId], (err, result) => {
                                if (err) throw err
                                responseJSON[key]["participateStatus"] = result[0].Entrant
                                callback()
                            })                            
                        })
                    })
                })
        }, async function () {
            return callback(responseJSON)
        })
    }
})



// Sends events specific to the searched group
app.post('/api/group/events', (req, res) => {
    let idGroup = req.body.idGroup
    let userEmail = req.body.email
    let sql = 'CALL getGroupEvents(?)'

    connection.query('SELECT idUser FROM User WHERE email = ?', [userEmail], (err, result, fields) => {
        if (err) throw err
        let idUser = result[0].idUser

        connection.query(sql, [idGroup], (err, results, fields) => {
            if (err) {
                console.log("Oops :[mysql error] ", err)
            }
            console.log(results)
            getGroupEventsParticipants(results, idUser, function (data) {
                res.json({
                    "GroupEvents":
                        data
                })
            })
        })
    })
    const getGroupEventsParticipants = (sentResults, sentIdUser, callback) => {
        const sqlGetInParticipants = 'CALL getInParticipants(?)'
        const sqlGetOutParticipants = 'CALL getOutParticipants(?)'
        let responseJSON = new Object()
        responseJSON = sentResults[0]
        async.forEachOf(sentResults[0], function (value, key, callback) {
            let eventId = sentResults[0][key].idEvent

            connection.query(sqlGetInParticipants, [eventId], (err, result) => {
                if (err) throw err
                responseJSON[key]["numberOfParticipants"] = result[0][0].numberOfParticipants

                connection.query(sqlGetOutParticipants, [eventId], (err, result) => {
                    if (err) throw err
                    responseJSON[key]["numberOfParticipantsOut"] = result[0][0].numberOfParticipants
                    connection.query('SELECT Entrant FROM Participants WHERE idUser = ? AND idEvent = ?', [sentIdUser, eventId], (err, result) => {
                        if (err) throw err
                        console.log(result.length)
                        if (result.length > 0) {
                            responseJSON[key]["participateStatus"] = result[0].Entrant                            
                        }
                        else {
                            responseJSON[key]["participateStatus"] = null
                        }
                        callback()
                    })                    
                })
            })
        }, async function () {
            return callback(responseJSON)
        })
    }
})


// Add user to group
app.post('/api/group/addtogroup', (req, res) => {
    try {
        let groupPassword = req.body.groupPassword
        let userEmail = req.body.email
        let sqlAddToGroup = 'CALL addToGroup(?, ?)'
        let sqlGetUserGroups = 'CALL getUserGroups(?)'

        connection.query('SELECT idUser FROM User WHERE email = ?', [userEmail], (err, results) => {
            if (err) throw err
            if (results.length > 0) {
                const idUser = results[0].idUser
                connection.query('SELECT idGroups FROM Groups WHERE GroupPassword = ?', [groupPassword], (err, results) => {
                    if (err) throw err
                    console.log(results)
                    console.log(results.length)
                    if (results.length > 0) {
                        const idGroup = results[0].idGroups
                        connection.query(sqlGetUserGroups, [idUser], (err, results) => {
                            if (err) throw err
                            let userAlreadyAdded = null
                            for (let i = 0; i != results[0].length; i++) {
                                if (results[0][i].idGroups == idGroup) {
                                    userAlreadyAdded = true
                                    break
                                }
                            }
                            if (userAlreadyAdded == true) {
                                res.status(200).send({
                                    "AddtogroupResponse": [
                                        {
                                            message: 'Oops user is already added to this group.'
                                        }
                                    ]
                                })
                            }
                            else {
                                connection.query(sqlAddToGroup, [idGroup, idUser], (err, results, fields) => {
                                    if (err) throw err
                                    res.status(200).json({
                                        "AddtogroupResponse": [
                                            {
                                                message: 'User is added to the group.'
                                            }
                                        ]
                                    })
                                })
                            }
                        })
                    }
                    else {
                        res.status(200).json({
                            "AddtogroupResponse": [
                                {
                                    message: 'No groups found with this password'
                                }
                            ]
                        })
                    }
                })

            } else {
                res.status(500).json({
                    "AddtogroupResponse": [
                        {
                            message: 'No email found, error'
                        }
                    ]
                })
            }                   
        })
    } catch (e) {
        res.status(500).send(e)
    }
})


//Get event participants
app.post('/api/group/events/participants', (req, res) => {
    try {
        const idEvent = req.body.idEvent
        const sqlGetParticipants = 'CALL getParticipants(?)'

        connection.query(sqlGetParticipants, [idEvent], (err, results, fields) => {
            if (err) throw err
            if (results[0].length > 0) {
                res.status(200).json({
                    "Participants":
                        results[0]
                })
            } else {
                res.status(500).send('No participants found from this event')
            }
        })
    } catch {
        res.status(500).send()
    }
})


//Sign participants to event
app.post('/api/group/events/signtoevent', (req, res) => {
    try {
        const userEmail = req.body.email
        const idEvent = req.body.idEvent
        const entryType = req.body.entryType
        const sqlSignToEvent = 'CALL signToEvent(?,?,?)'

        connection.query('SELECT idUser FROM User WHERE email = ?', [userEmail], (err, results, fields) => {
            if (err) throw err
            const idUser = results[0].idUser
            connection.query(sqlSignToEvent, [idUser, idEvent, entryType], (err, results, fields) => {
                if (err) throw err
                if (entryType == 1) {
                    res.status(200).send('Signing in succesful!')
                } else if (entryType == 0) {
                    res.status(200).send('Signing off succesful!')
                } else {
                    res.status(500).send('Entry type error!')
                }
            })
        })

    } catch {
        res.status(500).send()
    }
})

// Sign non-registered user to the
app.post('/api/group/events/signtoevent/nonregister', (req, res) => {
    try {
        const idEvent = req.body.idEvent
        const entryType = "in"

        const user = {
            nickname: req.body.nickname,
            password: "this is unregistered user"
        }

        connection.query('INSERT INTO User SET ?', user, (err, results) => {
            if (err) throw err
            console.log("test")
            connection.query('SELECT idUser,nickname FROM User WHERE nickname = ? AND email is null ORDER BY  idUser DESC LIMIT 1', [user.nickname], (err, results) => {
                if (err) throw err
                console.log(results)
                if (results.length != 0) {
                    const idUser = results[0].idUser
                    connection.query('INSERT INTO Participants (idUser,idEvent,Entrant) VALUES (?,?,?)', [idUser, idEvent, entryType], (err, results) => {
                        if (err) throw err
                        res.send('Non registered user signed to event!')
                    })
                } else {
                    res.send('No user found, error')
                }
            })
        })
    } catch {
        res.status(500).send()
    }
})

// Delete group
app.post('/api/delete/group', (req, res) => {
    try {
        const idGroup = req.body.idGroup
        const sqlDeleteGroup = 'CALL deleteGroup(?)'

        connection.query(sqlDeleteGroup, [idGroup], (err) => {
            if (err) throw err
            res.json({
                message: "Group deleted"
            })
        })
    } catch {
        res.status(500).send()
    }
})

// Delete event
app.post('/api/delete/event', (req, res) => {
    try {
        const idEvent = req.body.idEvent
        const sqlDeleteEvent = 'CALL deleteEvent(?)'

        connection.query(sqlDeleteEvent, [idEvent], (err) => {
            if (err) throw err
            res.json({
                message: "Event deleted"
            })
        })
    } catch {
        res.status(500).send()
    }
})

// Kick user
app.post('/api/kick/user', (req, res) => {
    try {
        const idGroup = req.body.idGroup
        const userEmail = req.body.email
        const sqlKickUser = 'CALL kickUser(?,?)'

        connection.query('SELECT idUser FROM User WHERE email = ?', [userEmail], (err, results) => { 
            if (err) throw err
            const idUser = results[0].idUser

            connection.query(sqlKickUser, [idUser, idGroup], (err) => {
                if (err) throw err
                res.status(200).json({
                    "KickUserResponse": [
                        {
                            message: 'User kicked'
                        }
                    ]
                })         
            })
        })
    } catch {
        res.status(500).send()
    }
})

// Send message
app.post('/chat/sendmessage', (req, res) => {
    try {
        const message = req.body.message
        const idUser = req.body.idUser
        const idGroup = req.body.idGroup


        connection.query('INSERT INTO Message (sender,receiver,message) VALUES (?,?,?)', [idUser, idGroup, message], (err) => {
            if (err) throw err
            res.status(200).send('Message sent')
        })
    } catch {
        res.status(500).send()
    }
})

// Get message
app.post('/chat/getmessages', (req, res) => {
    try  {
        const idGroup = req.body.idGroup
        const sqlGetMessages = 'CALL getMessages(?)'

        connection.query(sqlGetMessages, [idGroup], (err, results) => {
            if (err) throw err
            res.status(200).json({
                GroupMessages: 
                    results[0]
                
            })
        })
    } catch {
        res.status(500).send()
    }
})

app.get('/test/auth', authenticateToken, (req, res) => {
    res.json({
        message: 'This is protected message'
    })
})

app.get('/test/get', (req, res) => {
    let r = Math.random().toString(36).substring(2)
    console.log("random", r)
    res.send("test")
})

/*---------------------------- FUNCTIONS ------------------*/

//Checks if authorization header is correct
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (token == null) { return res.sendStatus(401) }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) { return res.sendStatus(403) }
        req.user = user
        next()
    })
}