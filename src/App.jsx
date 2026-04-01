import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'reminderwork.tasks.v1'
const CATEGORY_OPTIONS = ['Job Scope', 'Ad Hoc']

const todayAtMidnight = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const toDateInput = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDate = (dateString) =>
  new Date(`${dateString}T00:00:00`).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const parseDateOnly = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const dayDifference = (fromDate, toDate) => {
  const milliseconds = toDate.getTime() - fromDate.getTime()
  return Math.floor(milliseconds / (24 * 60 * 60 * 1000))
}

// `date-holidays` is a moderately large library. We lazy-load it at runtime
// so the initial JS bundle stays small. While loading (or if import fails),
// we expose a minimal holidays object that treats all days as non-holidays.

const isWeekend = (date) => {
  const day = date.getDay()
  return day === 0 || day === 6
}

const isHoliday = (date, holidays) => {
  const holiday = holidays.isHoliday(date)
  return Boolean(holiday)
}

const getHolidayNames = (date, holidays) => {
  const holiday = holidays.isHoliday(date)
  if (!holiday) {
    return []
  }

  const holidayList = Array.isArray(holiday) ? holiday : [holiday]
  return holidayList.map((item) => item.name).filter(Boolean)
}

const getAdjustedSubmissionDate = (dueDateString, holidays) => {
  let adjusted = parseDateOnly(dueDateString)
  while (isWeekend(adjusted) || isHoliday(adjusted, holidays)) {
    adjusted.setDate(adjusted.getDate() - 1)
  }

  return adjusted
}

const getReminderStatus = (task, today) => {
  if (task.completed) {
    return { due: false, text: 'Completed' }
  }

  const dueDate = parseDateOnly(task.dueDate)
  const daysToDue = dayDifference(today, dueDate)
  const reminderWindowStart = new Date(dueDate)
  reminderWindowStart.setDate(reminderWindowStart.getDate() - 5)
  const reminderDue = today >= reminderWindowStart

  if (daysToDue > 5) {
    return { due: false, text: `Starts in ${daysToDue - 5} day(s)` }
  }

  if (daysToDue >= 0) {
    return { due: reminderDue, text: `Due in ${daysToDue} day(s)` }
  }

  return { due: true, text: `Overdue by ${Math.abs(daysToDue)} day(s)` }
}

const shouldNotifyTaskToday = (task, today, todayIso) => {
  const reminder = getReminderStatus(task, today)
  if (!reminder.due) {
    return false
  }

  return task.lastReminderDate !== todayIso
}

const monthMatrix = (viewDate) => {
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
  const startWeekday = monthStart.getDay()

  const cells = []
  for (let day = 0; day < startWeekday; day += 1) {
    cells.push(null)
  }

  for (let date = 1; date <= monthEnd.getDate(); date += 1) {
    cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), date))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function App() {
  const [holidays, setHolidays] = useState({ isHoliday: () => false })

  useEffect(() => {
    let mounted = true
    import('date-holidays')
      .then((mod) => {
        const Holidays = mod.default
        const hd = new Holidays()
        const candidates = [['MY', '14'], ['MY', 'KUL'], ['MY']]
        for (const candidate of candidates) {
          try {
            if (hd.init(...candidate)) break
          } catch (e) {
            // ignore and try next candidate
          }
        }

        if (mounted) setHolidays(hd)
      })
      .catch(() => {
        // keep fallback holidays object (no holidays)
      })

    return () => {
      mounted = false
    }
  }, [])
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return []
    }

    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      return []
    }

    return []
  })
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [viewMonth, setViewMonth] = useState(() => todayAtMidnight())
  const [formData, setFormData] = useState(() => ({
    title: '',
    description: '',
    category: CATEGORY_OPTIONS[0],
    dueDate: toDateInput(todayAtMidnight()),
  }))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  const sendDueReminders = useCallback(() => {
    if (typeof Notification === 'undefined') {
      return
    }

    if (Notification.permission !== 'granted') {
      return
    }

    const today = todayAtMidnight()
    const todayIso = toDateInput(today)
    const dueTasks = tasks.filter((task) => shouldNotifyTaskToday(task, today, todayIso))

    if (dueTasks.length === 0) {
      return
    }

    dueTasks.forEach((task) => {
      const reminder = getReminderStatus(task, today)
      new Notification(`Reminder: ${task.title}`, {
        body: `${task.category} • ${reminder.text} • Due ${formatDate(task.dueDate)}`,
      })
    })

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        dueTasks.some((dueTask) => dueTask.id === task.id)
          ? { ...task, lastReminderDate: todayIso }
          : task,
      ),
    )
  }, [tasks])

  useEffect(() => {
    const kickoffTimer = setTimeout(() => {
      sendDueReminders()
    }, 0)

    const reminderTimer = setInterval(() => {
      sendDueReminders()
    }, 60 * 1000)

    return () => {
      clearTimeout(kickoffTimer)
      clearInterval(reminderTimer)
    }
  }, [sendDueReminders])

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      return undefined
    }

    const syncNotificationPermission = () => {
      setNotificationPermission(Notification.permission)
    }

    window.addEventListener('focus', syncNotificationPermission)
    document.addEventListener('visibilitychange', syncNotificationPermission)

    return () => {
      window.removeEventListener('focus', syncNotificationPermission)
      document.removeEventListener('visibilitychange', syncNotificationPermission)
    }
  }, [])

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      new Notification('Notifications enabled', {
        body: 'You will get reminders from 5 days before due date.',
      })
    }
  }

  const onFieldChange = (event) => {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const onAddTask = (event) => {
    event.preventDefault()
    const title = formData.title.trim()
    if (!title) {
      return
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      description: formData.description.trim(),
      category: formData.category,
      dueDate: formData.dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
      lastReminderDate: null,
    }

    setTasks((current) => [...current, task])
    setFormData((current) => ({
      ...current,
      title: '',
      description: '',
    }))
  }

  const toggleCompleted = (taskId) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
            }
          : task,
      ),
    )
  }

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  )

  const tasksByDate = useMemo(() => {
    const mapped = new Map()
    tasks.forEach((task) => {
      const list = mapped.get(task.dueDate) ?? []
      list.push(task)
      mapped.set(task.dueDate, list)
    })
    return mapped
  }, [tasks])

  const calendarCells = useMemo(() => monthMatrix(viewMonth), [viewMonth])
  const todayIso = toDateInput(todayAtMidnight())
  const monthLabel = viewMonth.toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })
  const notificationStatus =
    notificationPermission === 'granted'
      ? { label: 'Enabled', className: 'enabled' }
      : notificationPermission === 'denied'
        ? { label: 'Blocked by browser', className: 'denied' }
        : notificationPermission === 'unsupported'
          ? { label: 'Not supported in this browser', className: 'unsupported' }
          : { label: 'Not enabled yet', className: 'pending' }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>ReminderWork</h1>
          <p className="subtitle">Task reminders with calendar + Malaysia KL holiday adjustment.</p>
        </div>
        <div className="notify-controls">
          <button
            type="button"
            className="notify-btn"
            disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
            onClick={requestNotificationPermission}
          >
            {notificationPermission === 'granted'
              ? 'Notifications enabled'
              : notificationPermission === 'unsupported'
                ? 'Notifications not supported'
                : notificationPermission === 'denied'
                  ? 'Notifications blocked'
                  : 'Enable notifications'}
          </button>
          <p className={`notify-status ${notificationStatus.className}`}>
            Notification status: <strong>{notificationStatus.label}</strong>
          </p>
        </div>
      </header>

      <section className="content-grid">
        <article className="panel">
          <h2>Add Task</h2>
          <form className="task-form" onSubmit={onAddTask}>
            <label>
              Title
              <input
                name="title"
                required
                value={formData.title}
                onChange={onFieldChange}
                placeholder="Prepare monthly report"
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                value={formData.description}
                onChange={onFieldChange}
                rows={3}
                placeholder="Optional details"
              />
            </label>

            <label>
              Category
              <select name="category" value={formData.category} onChange={onFieldChange}>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Due Date
              <input
                type="date"
                name="dueDate"
                required
                value={formData.dueDate}
                onChange={onFieldChange}
              />
            </label>

            <button className="primary-btn" type="submit">
              Save Task
            </button>
          </form>
        </article>
        <article className="panel">
          <div className="calendar-header">
            <h2>Calendar</h2>
            <div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() =>
                  setViewMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
              >
                ◀
              </button>
              <span>{monthLabel}</span>
              <button
                type="button"
                className="ghost-btn"
                onClick={() =>
                  setViewMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
              >
                ▶
              </button>
            </div>
          </div>

          <div className="weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="calendar-cell empty" />
              }

              const iso = toDateInput(cell)
              const dayTasks = tasksByDate.get(iso) ?? []
              const isToday = iso === todayIso
              const weekendCell = isWeekend(cell)
              const holidayNames = getHolidayNames(cell, holidays)
              const holidayCell = holidayNames.length > 0

              return (
                <div
                  key={iso}
                  className={`calendar-cell ${isToday ? 'today' : ''} ${weekendCell ? 'weekend' : ''} ${holidayCell ? 'holiday' : ''}`}
                >
                  <span className="date-number">{cell.getDate()}</span>
                  <div className="cell-tasks">
                    {holidayNames.length > 0 ? (
                      <span className="holiday-chip" title={holidayNames.join(', ')}>
                        🎉 {holidayNames[0]}
                        {holidayNames.length > 1 ? ` +${holidayNames.length - 1}` : ''}
                      </span>
                    ) : null}
                    {dayTasks.slice(0, 3).map((task) => (
                      <span key={task.id} className={`task-chip ${task.completed ? 'done' : ''}`}>
                        {task.title}
                      </span>
                    ))}
                    {dayTasks.length > 3 ? (
                      <span className="task-chip more">+{dayTasks.length - 3} more</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>Tasks</h2>
        {sortedTasks.length === 0 ? <p className="empty-state">No tasks yet.</p> : null}
        <div className="task-list">
          {sortedTasks.map((task) => {
            const adjustedDate = getAdjustedSubmissionDate(task.dueDate, holidays)
            const reminder = getReminderStatus(task, todayAtMidnight())
            const adjustedIso = toDateInput(adjustedDate)

            return (
              <article key={task.id} className={`task-card ${task.completed ? 'completed' : ''}`}>
                <div className="task-meta-row">
                  <span className="badge">{task.category}</span>
                  <span className="reminder-text">{reminder.text}</span>
                </div>
                <h3>{task.title}</h3>
                {task.description ? <p className="task-description">{task.description}</p> : null}
                <p>
                  Due date: <strong>{formatDate(task.dueDate)}</strong>
                </p>
                <p>
                  Adjusted submission date (KL working day):{' '}
                  <strong>{formatDate(adjustedIso)}</strong>
                </p>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => toggleCompleted(task.id)}
                >
                  {task.completed ? 'Mark as pending' : 'Mark as completed'}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default App
