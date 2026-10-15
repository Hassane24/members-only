const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const { body, validationResult } = require("express-validator");

// 7. Home Page: Display all messages with conditional author rendering
router.get("/", async (req, res) => {
  try {
    const { rows: messages } = await pool.query(`
      SELECT messages.*, users.first_name, users.last_name, users.username 
      FROM messages 
      JOIN users ON messages.user_id = users.id 
      ORDER BY timestamp DESC
    `);
    res.render("index", { messages });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// 3. Sign-Up Form (GET)
router.get("/sign-up", (req, res) => res.render("sign-up", { errors: [] }));

// 3. Sign-Up Form (POST) with validation & password confirmation
router.post(
  "/sign-up",
  [
    body("first_name").trim().notEmpty().withMessage("First name is required."),
    body("last_name").trim().notEmpty().withMessage("Last name is required."),
    body("username").isEmail().withMessage("Must be a valid email address."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long."),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password confirmation does not match password.");
      }
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render("sign-up", { errors: errors.array() });
    }

    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const isAdmin = req.body.is_admin === "on" ? true : false; // Optional admin checkbox handling

      await pool.query(
        `INSERT INTO users (first_name, last_name, username, password, membership_status, is_admin) 
         VALUES ($1, $2, $3, $4, FALSE, $5)`,
        [
          req.body.first_name,
          req.body.last_name,
          req.body.username,
          hashedPassword,
          isAdmin,
        ],
      );
      res.redirect("/log-in");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error registering user");
    }
  },
);

// 5. Login Form (GET & POST)
router.get("/log-in", (req, res) => res.render("log-in"));

router.post(
  "/log-in",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/log-in",
  }),
);

// Log out route
router.get("/log-out", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// 4. Join the Club (GET & POST)
router.get("/join-club", ensureAuthenticated, (req, res) =>
  res.render("join-club", { error: null }),
);

router.post("/join-club", ensureAuthenticated, async (req, res) => {
  const SECRET_PASSCODE = "theclubsecret"; // Set your secret code here
  if (req.body.passcode === SECRET_PASSCODE) {
    await pool.query(
      "UPDATE users SET membership_status = TRUE WHERE id = $1",
      [req.user.id],
    );
    return res.redirect("/");
  }
  res.render("join-club", { error: "Incorrect Passcode! Try again." });
});

// 6. Create Message (GET & POST)
router.get("/create-message", ensureAuthenticated, (req, res) =>
  res.render("create-message"),
);

router.post("/create-message", ensureAuthenticated, async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO messages (title, text, user_id) VALUES ($1, $2, $3)",
      [req.body.title, req.body.text, req.user.id],
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating message");
  }
});

// 8. Delete Message (Admin Only)
router.post("/messages/:id/delete", ensureAuthenticated, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).send("Unauthorized: Admins only");
  }
  try {
    await pool.query("DELETE FROM messages WHERE id = $1", [req.params.id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting message");
  }
});

// Middleware helper
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/log-in");
}

module.exports = router;
