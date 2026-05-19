// ===== API CONFIG =====
const API_URL = window.location.origin;

let isLoginMode = true;

// ===== AUTH HEADERS =====
function getAuthHeaders() {

  const token =
    localStorage.getItem('token');

  return {
    'Content-Type':
      'application/json',
    'Authorization':
      `Bearer ${token}`
  };
}

// ===== SESSION BOOT =====
function initSession() {

  const token =
    localStorage.getItem('token');

  const email =
    localStorage.getItem('email');

  const role =
    localStorage.getItem('role');

  const authOverlay =
    document.getElementById(
      'auth-overlay'
    );

  if (token) {

    authOverlay.classList.add(
      'hidden'
    );

    document.getElementById(
      'user-display-email'
    ).innerText =
      `👤 ${email}`;

    document.getElementById(
      'user-display-role'
    ).innerText =
      role;

    if (
      role === 'ADMIN' ||
      role === 'MANAGER'
    ) {

      document
        .getElementById(
          'management-hub'
        )
        .classList.remove(
          'hidden'
        );

    } else {

      document
        .getElementById(
          'management-hub'
        )
        .classList.add(
          'hidden'
        );
    }

    fetchAnalytics();
    fetchTasks();
    fetchProjects();

  } else {

    authOverlay.classList.remove(
      'hidden'
    );
  }
}

// ===== TOGGLE LOGIN / REGISTER =====
document
  .getElementById(
    'toggle-auth-mode'
  )
  .addEventListener(
    'click',
    (e) => {

      e.preventDefault();

      isLoginMode =
        !isLoginMode;

      document.getElementById(
        'auth-title'
      ).innerText =
        isLoginMode
          ? "Welcome back"
          : "Create Account";

      document.getElementById(
        'auth-submit-btn'
      ).innerText =
        isLoginMode
          ? "Sign In"
          : "Register Profile";

      document
        .getElementById(
          'auth-role'
        )
        .classList.toggle(
          'hidden',
          isLoginMode
        );
    }
  );

// ===== AUTH FORM =====
document
  .getElementById(
    'auth-form'
  )
  .addEventListener(
    'submit',
    async (e) => {

      e.preventDefault();

      try {

        const email =
          document
            .getElementById(
              'auth-email'
            )
            .value
            .trim()
            .toLowerCase();

        const password =
          document
            .getElementById(
              'auth-password'
            )
            .value;

        const role =
          document
            .getElementById(
              'auth-role'
            )
            .value;

        const endpoint =
          isLoginMode
            ? '/auth/login'
            : '/auth/register';

        const payload =
          isLoginMode
            ? {
                email,
                password
              }
            : {
                email,
                password,
                role
              };

        const response =
          await fetch(
            `${API_URL}${endpoint}`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify(
                  payload
                )
            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          return alert(
            data.error ||
            "Authentication failed."
          );
        }

        if (isLoginMode) {

          localStorage.setItem(
            'token',
            data.token
          );

          localStorage.setItem(
            'email',
            data.email
          );

          localStorage.setItem(
            'role',
            data.role
          );

          initSession();

        } else {

          alert(
            "Registration successful. Please sign in."
          );

          isLoginMode = true;

          document
            .getElementById(
              'auth-role'
            )
            .classList.add(
              'hidden'
            );

          document
            .getElementById(
              'auth-title'
            )
            .innerText =
            "Welcome back";

          document
            .getElementById(
              'auth-submit-btn'
            )
            .innerText =
            "Sign In";
        }

      } catch (error) {

        console.error(
          "AUTH ERROR:",
          error
        );

        alert(
          "Network or server error."
        );
      }
    }
  );

// ===== LOGOUT =====
document
  .getElementById(
    'logout-btn'
  )
  .addEventListener(
    'click',
    () => {

      localStorage.clear();
      location.reload();
    }
  );

// ===== ANALYTICS =====
async function fetchAnalytics() {

  try {

    const res =
      await fetch(
        `${API_URL}/dashboard/analytics`,
        {
          headers:
            getAuthHeaders()
        }
      );

    if (!res.ok) return;

    const stats =
      await res.json();

    document.getElementById(
      'stat-total'
    ).innerText =
      stats.totalTasks;

    document.getElementById(
      'stat-todo'
    ).innerText =
      stats.todoTasks;

    document.getElementById(
      'stat-progress'
    ).innerText =
      stats.progressTasks;

    document.getElementById(
      'stat-done'
    ).innerText =
      stats.doneTasks;

    document.getElementById(
      'stat-overdue'
    ).innerText =
      stats.overdueTasks || 0;

  } catch (error) {

    console.error(error);
  }
}

// ===== PROJECTS =====
async function fetchProjects() {

  try {

    const res =
      await fetch(
        `${API_URL}/tasks`,
        {
          headers:
            getAuthHeaders()
        }
      );

    if (!res.ok) return;

    const tasks =
      await res.json();

    const dropdown =
      document.getElementById(
        'task-project'
      );

    dropdown.innerHTML =
      `<option value="" disabled selected>Select Parent Project</option>`;

    tasks.forEach(task => {

      if (
        task.project &&
        !dropdown.innerHTML.includes(
          `value="${task.project.id}"`
        )
      ) {

        dropdown.innerHTML +=
          `<option value="${task.project.id}">
            📁 ${task.project.name}
          </option>`;
      }
    });

  } catch (error) {

    console.error(error);
  }
}

// ===== TASK FETCH =====
async function fetchTasks() {

  try {

    const res =
      await fetch(
        `${API_URL}/tasks`,
        {
          headers:
            getAuthHeaders()
        }
      );

    if (!res.ok) return;

    const tasks =
      await res.json();

    const todoList =
      document.getElementById(
        'todo-list'
      );

    const doneList =
      document.getElementById(
        'done-list'
      );

    todoList.innerHTML = '';
    doneList.innerHTML = '';

    let todoCount = 0;
    let doneCount = 0;

    tasks.forEach(task => {

      const card =
        document.createElement(
          'div'
        );

      card.className =
        'task-card';

      card.innerHTML = `
        <span class="badge badge-${task.category.toLowerCase()}">
          ${task.category}
        </span>

        <h3>${task.title}</h3>

        <p>
          ${task.description || 'No description'}
        </p>
      `;

      if (
        task.status === 'DONE'
      ) {

        doneList.appendChild(
          card
        );

        doneCount++;

      } else {

        todoList.appendChild(
          card
        );

        todoCount++;
      }
    });

    document.getElementById(
      'todo-count'
    ).innerText =
      todoCount;

    document.getElementById(
      'done-count'
    ).innerText =
      doneCount;

  } catch (error) {

    console.error(error);
  }
}

// ===== BOOT =====
initSession();