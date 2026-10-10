const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = 3000;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ======================================================
// MYSQL CONNECTION
// ======================================================

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {

    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
        return;
    }

    console.log("✅ Connected to MySQL database");
});


// ======================================================
// CUSTOMER - JOIN QUEUE
// ======================================================

app.post("/api/queue", (req, res) => {

    const { customer_name, service_type } = req.body;

    if (!customer_name || !service_type) {

        return res.status(400).json({
            success: false,
            message: "Name and service are required."
        });
    }

    const tokenQuery = `
        SELECT MAX(token_number) AS lastToken
        FROM queue
    `;

    db.query(tokenQuery, (err, result) => {

        if (err) {

            console.error(err);

            return res.status(500).json({
                success: false,
                message: "Could not generate token."
            });
        }

        const lastToken = result[0].lastToken || 0;

        const newToken = lastToken + 1;

        const insertQuery = `
            INSERT INTO queue
            (token_number, customer_name, service_type)
            VALUES (?, ?, ?)
        `;

        db.query(
            insertQuery,
            [newToken, customer_name, service_type],
            (err) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({
                        success: false,
                        message: "Could not join queue."
                    });
                }

                res.json({
                    success: true,
                    token_number: newToken,
                    customer_name: customer_name,
                    service_type: service_type,
                    message: "Successfully joined the queue."
                });

            }
        );

    });

});


// ======================================================
// CUSTOMER - LIVE QUEUE STATUS
// ======================================================

app.get("/api/queue/status", (req, res) => {

    const waitingQuery = `
        SELECT COUNT(*) AS waiting
        FROM queue
        WHERE status = 'waiting'
    `;

    const servingQuery = `
        SELECT token_number, customer_name, service_type
        FROM queue
        WHERE status = 'serving'
        ORDER BY served_at DESC
        LIMIT 1
    `;

    db.query(waitingQuery, (err, waitingResult) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Could not get queue status."
            });
        }

        db.query(servingQuery, (err, servingResult) => {

            if (err) {

                return res.status(500).json({
                    success: false,
                    message: "Could not get serving status."
                });
            }

            res.json({
                success: true,

                waiting: waitingResult[0].waiting,

                serving: servingResult.length > 0
                    ? servingResult[0]
                    : null
            });

        });

    });

});


// ======================================================
// CUSTOMER - CHECK OWN TOKEN
// ======================================================

app.get("/api/queue/:token", (req, res) => {

    const token = Number(req.params.token);

    if (!Number.isInteger(token)) {

        return res.status(400).json({
            success: false,
            message: "Invalid token."
        });
    }

    const query = `
        SELECT
            id,
            token_number,
            customer_name,
            service_type,
            status,
            joined_at,
            served_at,
            completed_at
        FROM queue
        WHERE token_number = ?
        ORDER BY id DESC
        LIMIT 1
    `;

    db.query(query, [token], (err, results) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Could not find token."
            });
        }

        if (results.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Token not found."
            });
        }

        res.json({
            success: true,
            customer: results[0]
        });

    });

});


// ======================================================
// ADMIN - GET COMPLETE QUEUE
// ======================================================

app.get("/api/admin/queue", (req, res) => {

    const query = `
        SELECT *
        FROM queue
        ORDER BY
            CASE
                WHEN status = 'serving' THEN 1
                WHEN status = 'waiting' THEN 2
                WHEN status = 'completed' THEN 3
                WHEN status = 'skipped' THEN 4
            END,
            token_number ASC
    `;

    db.query(query, (err, results) => {

        if (err) {

            console.error(err);

            return res.status(500).json({
                success: false,
                message: "Could not load queue."
            });
        }

        res.json({
            success: true,
            queue: results
        });

    });

});


// ======================================================
// ADMIN - CALL NEXT CUSTOMER
// ======================================================

app.post("/api/admin/call-next", (req, res) => {

    // First check if someone is already being served

    const servingQuery = `
        SELECT *
        FROM queue
        WHERE status = 'serving'
        LIMIT 1
    `;

    db.query(servingQuery, (err, servingResult) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Could not check current customer."
            });
        }

        if (servingResult.length > 0) {

            return res.json({
                success: false,
                message:
                    "A customer is already being served. Complete that customer first."
            });
        }


        // Find next waiting customer

        const nextQuery = `
            SELECT *
            FROM queue
            WHERE status = 'waiting'
            ORDER BY token_number ASC
            LIMIT 1
        `;

        db.query(nextQuery, (err, results) => {

            if (err) {

                return res.status(500).json({
                    success: false,
                    message: "Could not find next customer."
                });
            }

            if (results.length === 0) {

                return res.json({
                    success: false,
                    message: "No customers are waiting."
                });
            }

            const customer = results[0];

            const updateQuery = `
                UPDATE queue
                SET status = 'serving',
                    served_at = NOW()
                WHERE id = ?
            `;

            db.query(
                updateQuery,
                [customer.id],
                (err) => {

                    if (err) {

                        return res.status(500).json({
                            success: false,
                            message: "Could not call customer."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Customer called successfully.",
                        customer: customer
                    });

                }
            );

        });

    });

});


// ======================================================
// ADMIN - COMPLETE CUSTOMER
// ======================================================

app.post("/api/admin/complete/:id", (req, res) => {

    const id = req.params.id;

    const query = `
        UPDATE queue
        SET
            status = 'completed',
            completed_at = NOW()
        WHERE id = ?
    `;

    db.query(query, [id], (err, result) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Could not complete customer."
            });
        }

        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        res.json({
            success: true,
            message: "Customer completed successfully."
        });

    });

});


// ======================================================
// ADMIN - SKIP CUSTOMER
// ======================================================

app.post("/api/admin/skip/:id", (req, res) => {

    const id = req.params.id;

    const query = `
        UPDATE queue
        SET status = 'skipped'
        WHERE id = ?
    `;

    db.query(query, [id], (err, result) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Could not skip customer."
            });
        }

        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        res.json({
            success: true,
            message: "Customer skipped successfully."
        });

    });

});


// ======================================================
// HOME PAGE
// ======================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {

    console.log(
        `🚀 Server running at http://localhost:${PORT}`
    );

});