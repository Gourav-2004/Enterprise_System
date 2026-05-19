require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV CONFIG =====
const JWT_SECRET =
  process.env.JWT_SECRET || 'super-secret-vault-key-123';

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL missing!");
  process.exit(1);
}

// ===== PRISMA CONFIG =====
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});

const prisma = new PrismaClient({
  adapter
});

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ===== HEALTHCHECK =====
app.get('/', (req, res) => {
  res.send('✅ Enterprise Task Workspace Backend Running');
});

// ---------------------------------------------------------
// AUTH MIDDLEWARES
// ---------------------------------------------------------

function authenticateToken(req, res, next) {

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: "Access denied. Token missing."
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {

    if (err) {
      return res.status(403).json({
        error: "Invalid or expired token."
      });
    }

    req.user = decoded;
    next();
  });
}

function authorizeRoles(...allowedRoles) {

  return (req, res, next) => {

    if (
      !req.user ||
      !allowedRoles.includes(req.user.role)
    ) {
      return res.status(403).json({
        error: "Access denied."
      });
    }

    next();
  };
}

// ---------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------

app.post('/auth/register', async (req, res) => {

  try {

    console.log("REGISTER BODY:", req.body);

    let { email, password, role } = req.body;

    email = email?.trim().toLowerCase();

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error: "Email and password required."
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const definedRole =
      role &&
      ['ADMIN', 'MANAGER', 'USER'].includes(
        role.toUpperCase()
      )
        ? role.toUpperCase()
        : 'USER';

    const newUser =
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role: definedRole
        }
      });

    res.status(201).json({
      message: "Registration successful.",
      userId: newUser.id
    });

  } catch (error) {

    console.error(
      "❌ REGISTER ERROR:",
      error
    );

    if (error.code === 'P2002') {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    res.status(500).json({
      error: error.message
    });
  }
});

app.post('/auth/login', async (req, res) => {

  try {

    console.log("LOGIN BODY:", req.body);

    let email =
      req.body.email?.trim().toLowerCase();

    let password = req.body.password;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error:
          "Email and password must be strings."
      });
    }

    const user =
      await prisma.user.findUnique({
        where: { email }
      });

    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials."
      });
    }

    const passwordMatch =
      await bcrypt.compare(
        String(password),
        String(user.password)
      );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid credentials."
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      email: user.email,
      role: user.role
    });

  } catch (error) {

    console.error(
      "❌ LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// PROJECT ROUTES
// ---------------------------------------------------------

app.post(
  '/projects',
  authenticateToken,
  authorizeRoles('ADMIN', 'MANAGER'),
  async (req, res) => {

    try {

      const { name, description } =
        req.body;

      if (!name) {
        return res.status(400).json({
          error: "Project name required."
        });
      }

      const project =
        await prisma.project.create({
          data: {
            name,
            description
          }
        });

      res.status(201).json(project);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Failed to create project."
      });
    }
  }
);

// ---------------------------------------------------------
// TASK ROUTES
// ---------------------------------------------------------

app.get(
  '/tasks',
  authenticateToken,
  async (req, res) => {

    try {

      let tasks;

      if (
        ['ADMIN', 'MANAGER']
          .includes(req.user.role)
      ) {

        tasks =
          await prisma.task.findMany({
            include: {
              project: true,
              assignee: true
            }
          });

      } else {

        tasks =
          await prisma.task.findMany({
            where: {
              assigneeId:
                req.user.userId
            },
            include: {
              project: true
            }
          });
      }

      res.json(tasks);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Failed to fetch tasks."
      });
    }
  }
);

app.post(
  '/tasks',
  authenticateToken,
  async (req, res) => {

    try {

      const {
        title,
        description,
        category,
        dueDate,
        projectId,
        assigneeId
      } = req.body;

      if (!title || !projectId) {
        return res.status(400).json({
          error:
            "Title and project required."
        });
      }

      const newTask =
        await prisma.task.create({
          data: {
            title,
            description,
            category:
              category || 'General',
            dueDate:
              dueDate || null,
            projectId:
              parseInt(projectId),
            assigneeId:
              assigneeId
                ? parseInt(
                    assigneeId
                  )
                : null
          }
        });

      res.status(201).json(newTask);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Failed to create task."
      });
    }
  }
);

// ---------------------------------------------------------
// ANALYTICS
// ---------------------------------------------------------

app.get(
  '/dashboard/analytics',
  authenticateToken,
  async (req, res) => {

    try {

      let scope = {};

      if (
        req.user.role === 'USER'
      ) {
        scope = {
          assigneeId:
            req.user.userId
        };
      }

      const totalTasks =
        await prisma.task.count({
          where: scope
        });

      const todoTasks =
        await prisma.task.count({
          where: {
            ...scope,
            status: 'TODO'
          }
        });

      const progressTasks =
        await prisma.task.count({
          where: {
            ...scope,
            status: 'IN_PROGRESS'
          }
        });

      const doneTasks =
        await prisma.task.count({
          where: {
            ...scope,
            status: 'DONE'
          }
        });

      res.json({
        totalTasks,
        todoTasks,
        progressTasks,
        doneTasks
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Failed analytics."
      });
    }
  }
);

// ---------------------------------------------------------
// SERVER START
// ---------------------------------------------------------

async function startServer() {

  try {

    await prisma.$connect();

    console.log(
      "✅ Database connected successfully."
    );

    app.listen(PORT, () => {

      console.log(
        "===================================="
      );
      console.log(
        `🚀 Server running on port ${PORT}`
      );
      console.log(
        "===================================="
      );
    });

  } catch (error) {

    console.error(
      "❌ DATABASE CONNECTION FAILED:",
      error
    );

    process.exit(1);
  }
}

startServer();