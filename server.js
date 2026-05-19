const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const JWT_SECRET = 'super-secret-vault-key-123';

let prisma;

// Railway / production → PostgreSQL
if (process.env.DATABASE_URL?.startsWith('postgres')) {
  prisma = new PrismaClient();
}
// Local → SQLite adapter
else {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

  const adapter = new PrismaBetterSqlite3({
    url: './prisma/dev.db'
  });

  prisma = new PrismaClient({
    adapter
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ---------------------------------------------------------
// SECURITY & INTERCEPTOR MIDDLEWARES
// ---------------------------------------------------------

// Token Validator (Decodes identity and role strings)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err, decodedPayload) => {
    if (err) return res.status(403).json({ error: "Session expired or invalid token." });
    req.user = decodedPayload;
    next();
  });
}

// Role Validator (Blocks unauthorized users before hitting the endpoint)
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Elevated permissions required." });
    }
    next();
  };
}

// ---------------------------------------------------------
// AUTHENTICATION API ENDPOINTS
// ---------------------------------------------------------

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password criteria." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Normalize role string to match schema uppercase exactly
    const definedRole = role && ['ADMIN', 'MANAGER', 'USER'].includes(role.toUpperCase()) 
      ? role.toUpperCase() 
      : 'USER';

    // Explicit field matching block
    const newUser = await prisma.user.create({
      data: { 
        email: email.trim().toLowerCase(), 
        password: hashedPassword, 
        role: definedRole 
      }
    });

    res.status(201).json({ message: "Account verified.", userId: newUser.id });
  } catch (error) {
    console.error("❌ DETAILED REGISTRATION ERROR:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Email already exists." });
    }
    res.status(500).json({ error: `Registration sequence failed: ${error.message}` });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ error: "Login sequence failed." });
  }
});

// ---------------------------------------------------------
// PROJECT & TEAM MANAGEMENT ENDPOINTS
// ---------------------------------------------------------

// Create a new Project (Managers & Admins only)
app.post('/projects', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Project name required." });

    const project = await prisma.project.create({ data: { name, description } });
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: "Failed to construct project." });
  }
});

// Assign a Team Member to a Project
app.post('/projects/:id/team', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { userId, roleInTeam } = req.body;

    const mapping = await prisma.projectMember.create({
      data: { projectId, userId: parseInt(userId), roleInTeam: roleInTeam || 'MEMBER' }
    });
    res.json(mapping);
  } catch (error) {
    res.status(500).json({ error: "Failed to map team assignment." });
  }
});

// ---------------------------------------------------------
// TASK API ENGINE (With Built-in RBAC Access Controls)
// ---------------------------------------------------------

// Fetch scoped task sets
app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    let tasks;
    // Admins and Managers scan everything across the database
    if (['ADMIN', 'MANAGER'].includes(req.user.role)) {
      tasks = await prisma.task.findMany({ include: { project: true, assignee: true } });
    } else {
      // Standard Users only pull tasks explicitly assigned to them
      tasks = await prisma.task.findMany({
        where: { assigneeId: req.user.userId },
        include: { project: true }
      });
    }
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to pull tasks." });
  }
});

// Deploy a brand new task inside a project
app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, dueDate, projectId, assigneeId } = req.body;
    if (!title || !projectId) return res.status(400).json({ error: "Missing critical parameters." });

    const newTask = await prisma.task.create({
      data: {
        title,
        description,
        category: category || "General",
        dueDate: dueDate || null,
        projectId: parseInt(projectId),
        assigneeId: assigneeId ? parseInt(assigneeId) : null
      }
    });
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: "Failed to deploy task." });
  }
});

// Modify task properties (Users can change status; Managers/Admins can change anything)
app.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, category, dueDate, assigneeId } = req.body;

    const existingTask = await prisma.task.findUnique({ where: { id: parseInt(id) } });
    if (!existingTask) return res.status(404).json({ error: "Task not found." });

    // RBAC Security Filter: standard users can only touch their own assigned tasks
    if (req.user.role === 'USER' && existingTask.assigneeId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied. This is not your task assignment." });
    }

    const updated = await prisma.task.update({
      where: { id: parseInt(id) },
      data: { title, description, status, category, dueDate, assigneeId: assigneeId ? parseInt(assigneeId) : undefined }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to alter task records." });
  }
});

// Wiping records completely is locked to ADMIN levels only
app.delete('/tasks/:id', authenticateToken, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Record permanently cleared by Admin command." });
  } catch (error) {
    res.status(500).json({ error: "Failed to process target deletion." });
  }
});

// ---------------------------------------------------------
// METRICS / DASHBOARD AGGREGATION ROUTE
// ---------------------------------------------------------
app.get('/dashboard/analytics', authenticateToken, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0]; // Current local date "YYYY-MM-DD"
    
    let scopeCondition = {};
    if (req.user.role === 'USER') {
      scopeCondition = { assigneeId: req.user.userId };
    }

    const totalTasks = await prisma.task.count({ where: scopeCondition });
    const todoTasks  = await prisma.task.count({ where: { ...scopeCondition, status: 'TODO' } });
    const progressTasks = await prisma.task.count({ where: { ...scopeCondition, status: 'IN_PROGRESS' } });
    const doneTasks  = await prisma.task.count({ where: { ...scopeCondition, status: 'DONE' } });
    
    // Overdue Calculation: Not DONE and Due Date is numerically less than today's stamp
    const overdueTasks = await prisma.task.count({
      where: {
        ...scopeCondition,
        NOT: { status: 'DONE' },
        dueDate: { lt: todayStr }
      }
    });

    res.json({ totalTasks, todoTasks, progressTasks, doneTasks, overdueTasks });
  } catch (error) {
    res.status(500).json({ error: "Failed to compile analytics summary." });
  }
});

// Make sure your app.listen looks like this:


app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Core Enterprise System Online on Port ${PORT}`);
  console.log(`==================================================`);
});