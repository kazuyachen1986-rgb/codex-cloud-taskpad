const taskTitle = document.querySelector("#taskTitle");
const taskMessage = document.querySelector("#taskMessage");
const highPriority = document.querySelector("#highPriority");
const sendTask = document.querySelector("#sendTask");
const taskList = document.querySelector("#taskList");
const taskTemplate = document.querySelector("#taskTemplate");
const connectionStatus = document.querySelector("#connectionStatus");
const filters = Array.from(document.querySelectorAll(".filter"));
const gate = document.querySelector("#gate");
const gateForm = document.querySelector("#gateForm");
const accessCode = document.querySelector("#accessCode");
const gateError = document.querySelector("#gateError");

let tasks = [];
let activeFilter = "all";
let savedAccessCode = localStorage.getItem("codex-taskpad-access-code") || "";

const statusLabels = {
  new: "新任务",
  accepted: "已接收",
  working: "进行中",
  done: "完成"
};

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function visibleTasks() {
  if (activeFilter === "all") return tasks;
  if (activeFilter === "working") {
    return tasks.filter((task) => ["accepted", "working"].includes(task.status));
  }
  return tasks.filter((task) => task.status === activeFilter);
}

function render() {
  taskList.innerHTML = "";
  const list = visibleTasks();

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "这里还没有任务";
    taskList.append(empty);
    return;
  }

  for (const task of list) {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h2").textContent = task.title;
    node.querySelector(".meta").textContent = `${statusLabels[task.status] || task.status} · ${formatTime(task.updatedAt)}`;
    node.querySelector(".message").textContent = task.message || "没有补充说明";

    const pill = node.querySelector(".pill");
    pill.textContent = task.priority === "high" ? "加急" : statusLabels[task.status];
    pill.classList.toggle("high", task.priority === "high");

    node.querySelectorAll("[data-status]").forEach((button) => {
      button.disabled = task.status === button.dataset.status;
      button.addEventListener("click", () => updateStatus(task.id, button.dataset.status));
    });

    taskList.append(node);
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      "x-access-code": savedAccessCode
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "请求失败");
  }

  return response.json();
}

async function loadTasks() {
  try {
    const data = await requestJson("/api/tasks");
    tasks = data.tasks;
    connectionStatus.classList.add("online");
    render();
  } catch {
    connectionStatus.classList.remove("online");
    gate.classList.remove("hidden");
  }
}

async function verifyAccess(code) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessCode: code })
  });
  if (!response.ok) throw new Error("访问码不对");
  savedAccessCode = code;
  localStorage.setItem("codex-taskpad-access-code", code);
  gate.classList.add("hidden");
  await loadTasks();
}

async function createTask() {
  const title = taskTitle.value.trim();
  const message = taskMessage.value.trim();
  if (!title && !message) return;

  sendTask.disabled = true;
  try {
    const data = await requestJson("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title,
        message,
        priority: highPriority.checked ? "high" : "normal"
      })
    });
    tasks.unshift(data.task);
    taskTitle.value = "";
    taskMessage.value = "";
    highPriority.checked = false;
    render();
  } finally {
    sendTask.disabled = false;
  }
}

async function updateStatus(id, status) {
  const data = await requestJson(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  tasks = tasks.map((task) => task.id === id ? data.task : task);
  render();
}

sendTask.addEventListener("click", createTask);
taskMessage.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    createTask();
  }
});

filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gateError.textContent = "";
  try {
    await verifyAccess(accessCode.value.trim());
  } catch (error) {
    gateError.textContent = error.message;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

if (savedAccessCode) {
  gate.classList.add("hidden");
  loadTasks();
} else {
  accessCode.focus();
}
setInterval(loadTasks, 5000);

