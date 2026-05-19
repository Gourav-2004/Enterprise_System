const API_URL = 'http://localhost:3000';
let isLoginMode = true;

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
}

function initSession() {
  const token = localStorage.getItem('token');
  const email = localStorage.getItem('email');
  const role = localStorage.getItem('role');
  const authOverlay = document.getElementById('auth-overlay');

  if (token) {
    authOverlay.classList.add('hidden');
    document.getElementById('user-display-email').innerText = `👤 ${email}`;
    document.getElementById('user-display-role').innerText = role;

    // Show management panel if user is ADMIN or MANAGER
    if (role === 'ADMIN' || role === 'MANAGER') {
      document.getElementById('management-hub').classList.remove('hidden');
    } else {
      document.getElementById('management-hub').classList.add('hidden');
    }

    fetchAnalytics();
    fetchTasks();
    // Pre-populate project mapping options
    fetchProjects();
  } else {
    authOverlay.classList.remove('hidden');
  }
}

// --- AUTOMATED TOGGLE FOR SIGNUP PERMISSIONS ---
document.getElementById('toggle-auth-mode').addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  document.getElementById('auth-title').innerText = isLoginMode ? "Welcome back" : "Create Account";
  document.getElementById('auth-submit-btn').innerText = isLoginMode ? "Sign In" : "Register Profile";
  document.getElementById('auth-role').classList.toggle('hidden', isLoginMode);
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const role = document.getElementById('auth-role').value;

  const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
  const payload = isLoginMode ? { email, password } : { email, password, role };

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  if (!response.ok) return alert(data.error || "Authentication execution failed.");

  if (isLoginMode) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('email', data.email);
    localStorage.setItem('role', data.role);
    initSession();
  } else {
    alert("Registration approved! Please sign in.");
    isLoginMode = true;
    document.getElementById('auth-role').classList.add('hidden');
    document.getElementById('auth-title').innerText = "Welcome back";
    document.getElementById('auth-submit-btn').innerText = "Sign In";
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  location.reload();
});

// --- FETCH METRICS SUMMARY ---
async function fetchAnalytics() {
  const res = await fetch(`${API_URL}/dashboard/analytics`, { headers: getAuthHeaders() });
  if (!res.ok) return;
  const stats = await res.json();
  
  document.getElementById('stat-total').innerText = stats.totalTasks;
  document.getElementById('stat-todo').innerText = stats.todoTasks;
  document.getElementById('stat-progress').innerText = stats.progressTasks;
  document.getElementById('stat-done').innerText = stats.doneTasks;
  document.getElementById('stat-overdue').innerText = stats.overdueTasks;
}

// --- PROJECT MANAGEMENT PIPELINE ---
document.getElementById('project-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-desc').value;

  const res = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, description })
  });

  if (res.ok) {
    document.getElementById('project-form').reset();
    fetchProjects();
  }
});

async function fetchProjects() {
  // Simulating retrieval - for safety we fetch all tasks containing project data
  const res = await fetch(`${API_URL}/tasks`, { headers: getAuthHeaders() });
  if (!res.ok) return;
  const tasks = await res.json();
  
  const dropdown = document.getElementById('task-project');
  dropdown.innerHTML = '<option value="" disabled selected>Select Parent Project</option>';
  
  // Quick baseline dynamic injection for testing
  const projects = Array.from(new Set(tasks.map(t => t.projectId)));
  if (projects.length === 0) {
    // Inject fallback default project option option if none exist yet
    dropdown.innerHTML += `<option value="1">🏛️ Alpha Core Strategy</option>`;
  }
  tasks.forEach(t => {
    if (t.project) {
      if (!dropdown.innerHTML.includes(`value="${t.project.id}"`)) {
        dropdown.innerHTML += `<option value="${t.project.id}">📁 ${t.project.name}</option>`;
      }
    }
  });
}

// --- OBJECTIVE TASK PIPELINE ---
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value;
  const description = document.getElementById('task-desc').value;
  const category = document.getElementById('task-category').value;
  const dueDate = document.getElementById('task-duedate').value;
  const projectId = document.getElementById('task-project').value || 1; // Defers to index 1 fallback
  const assigneeId = document.getElementById('task-assignee').value;

  await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, description, category, dueDate, projectId, assigneeId })
  });

  document.getElementById('task-form').reset();
  fetchAnalytics();
  fetchTasks();
});

async function fetchTasks() {
  const res = await fetch(`${API_URL}/tasks`, { headers: getAuthHeaders() });
  if (!res.ok) return;
  const tasks = await res.json();

  const todoList = document.getElementById('todo-list');
  const doneList = document.getElementById('done-list');
  todoList.innerHTML = ''; doneList.innerHTML = '';
  let todoCount = 0, doneCount = 0;

  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <span class="badge badge-${task.category.toLowerCase()}">${task.category}</span>
      <h3>${task.title}</h3>
      <p>${task.description || 'No extended objectives logged.'}</p>
      <div class="task-date">📅 Target Limit: ${task.dueDate || 'Open Timeline'}</div>
      <div class="task-actions">
        ${task.status !== 'DONE' ? `<button class="btn-action btn-complete" onclick="updateTask(${task.id}, 'DONE')">Complete</button>` : ''}
        ${localStorage.getItem('role') === 'ADMIN' ? `<button class="btn-action btn-delete" onclick="deleteTask(${task.id})">Purge</button>` : ''}
      </div>
    `;

    if (task.status === 'DONE') {
      doneList.appendChild(card);
      doneCount++;
    } else {
      todoList.appendChild(card);
      todoCount++;
    }
  });

  document.getElementById('todo-count').innerText = todoCount;
  document.getElementById('done-count').innerText = doneCount;
}

async function updateTask(id, status) {
  await fetch(`${API_URL}/tasks/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status })
  });
  fetchAnalytics();
  fetchTasks();
}

async function deleteTask(id) {
  await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  fetchAnalytics();
  fetchTasks();
}

// Global invocation boot
initSession();