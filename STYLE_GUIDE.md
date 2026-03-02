# WFMS Style Guide & Component Reference

## Table of Contents
1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing & Layout](#spacing--layout)
4. [Components](#components)
5. [Responsive Design](#responsive-design)
6. [Theme Integration](#theme-integration)

---

## Color System

### Primary Colors
```
--primary: #2563eb (Blue)        /* Main brand color */
--primary-dark: #1e40af (Dark Blue) /* Hover states */
```

### Status Colors
```
--success: #10b981 (Green)   /* Success, completed */
--warning: #f59e0b (Amber)   /* Warning, pending */
--danger: #ef4444 (Red)      /* Error, important */
--info: #0ea5e9 (Cyan)       /* Information */
```

### Neutral Colors
```
--secondary: #64748b (Slate)
```

### Dark Theme (Default)
```
--bg-dark: #0f172a                   /* Main background */
--bg-dark-secondary: #1e293b         /* Secondary background */
--card-dark: #1e293b                 /* Card background */
--text-dark: #e2e8f0                 /* Primary text */
--text-dark-muted: #94a3b8           /* Secondary text */
--border-dark: #334155               /* Border color */
```

### Light Theme Alternative
```
--bg-light: #f8fafc                  /* Main background */
--bg-light-secondary: #f1f5f9        /* Secondary background */
--card-light: #ffffff                /* Card background */
--text-light: #0f172a                /* Primary text */
--text-light-muted: #64748b          /* Secondary text */
--border-light: #e2e8f0              /* Border color */
```

### Usage Example
```html
<!-- Button with primary color -->
<button class="btn btn-primary">Sign In</button>

<!-- Status indicators -->
<span class="badge bg-success">Completed</span>
<span class="badge bg-warning">Pending</span>
<span class="badge bg-danger">Error</span>
```

---

## Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```
System fonts for optimal cross-platform rendering.

### Font Sizes
```
Headings:  28px (h2), 24px (h3-h4), 20px (h5), 18px (h6)
Body:      14px (default)
Small:     12px (.small class)
Labels:    13px (form labels, uppercase)
Monospace: 12px (logs, code)
```

### Font Weights
```
Regular:  400 (body text)
Semi-Bold: 600 (labels, callouts)
Bold:     700 (headings, important text)
```

### Line Heights
```
Body:     1.6 (readable)
Headings: 1.3 (compact)
Logs:     1.4 (code blocks)
```

### Text Classes
```html
<h1-h6>        <!-- Heading elements -->
<p>            <!-- Paragraphs -->
<small>        <!-- Small text -->
<strong>       <!-- Bold text -->
<em>           <!-- Emphasized text -->

<!-- Utility classes -->
<span class="text-center">Centered text</span>
<span class="text-muted">Muted gray text</span>
<span class="small">Small text</span>
```

---

## Spacing & Layout

### Spacing Scale
```css
4px   (used in compact elements)
8px   (mt-2, mb-2, gaps in compact layouts)
12px  (standard small gap)
16px  (mb-3, mt-3, standard gap)
20px  (form groups)
24px  (mb-4, mt-4, card padding)
32px  (mb-5, mt-4, large sections)
```

### Container
```css
max-width: 1400px;
margin: 0 auto;
padding: 0 20px;
```

### Border Radius
```css
--radius: 12px       /* Cards, containers */
           8px       /* Form inputs, smaller cards */
          50%        /* Circular elements, badges */
```

### Shadows
```css
--shadow: 0 4px 6px rgba(0, 0, 0, 0.1);         /* Subtle elevation */
--shadow-lg: 0 20px 25px rgba(0, 0, 0, 0.15);  /* Strong elevation */
```

### Grid Systems
```css
/* Stats grid - 3 columns on desktop */
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
gap: 24px;

/* Attendance buttons - flexible wrapping */
grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
gap: 12px;

/* Employee cards - gallery layout */
grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
gap: 16px;
```

---

## Components

### Buttons

#### Primary Button
```html
<button class="btn btn-primary">Action</button>
<button class="btn btn-primary btn-lg">Large Action</button>
<button class="btn btn-primary btn-sm">Small Action</button>
```

#### Button Variants
```html
<!-- Success -->
<button class="btn btn-success">Approve</button>

<!-- Warning -->
<button class="btn btn-warning">Caution</button>

<!-- Danger -->
<button class="btn btn-danger">Delete</button>

<!-- Info -->
<button class="btn btn-info">Learn More</button>

<!-- Outline -->
<button class="btn btn-outline-primary">Secondary</button>
<button class="btn btn-outline-danger">Outline Danger</button>
```

#### Icon Buttons
```html
<!-- With icon -->
<button class="btn btn-primary">
  <svg class="btn-icon">...</svg>
  Sign In
</button>

<!-- Circular -->
<button class="btn-icon-circle" title="Notifications">
  <svg>...</svg>
</button>
```

### Cards

#### Basic Card
```html
<div class="card">
  <div class="card-header-custom">
    <svg>...</svg>
    <h5 class="mb-0">Title</h5>
  </div>
  <p>Card content here</p>
</div>
```

#### Stats Card
```html
<div class="stat-card">
  <div class="stat-icon employees">
    <svg>...</svg>
  </div>
  <div class="stat-content">
    <h6 class="stat-label">Employees</h6>
    <p class="stat-value">24</p>
  </div>
</div>
```

### Forms

#### Input Fields
```html
<div class="form-group">
  <label class="form-label">Username</label>
  <input type="text" class="form-control" placeholder="Enter username" />
</div>

<div class="form-group">
  <label class="form-label">Role</label>
  <select class="form-control">
    <option>Employee</option>
    <option>Admin</option>
  </select>
</div>

<div class="form-group">
  <label class="form-label">Description</label>
  <textarea class="form-control" rows="3"></textarea>
</div>
```

#### Form States
```html
<!-- Normal -->
<input class="form-control" />

<!-- Focus -->
<input class="form-control" style="border-color: var(--primary);" />

<!-- Error -->
<input class="form-control error" />

<!-- Success -->
<input class="form-control success" />
```

### Badges
```html
<span class="badge bg-success">Completed</span>
<span class="badge bg-secondary">Pending</span>
<span class="badge bg-warning">Warning</span>
```

### Lists

#### Task List
```html
<div class="task-list">
  <div class="task-item">
    <strong>Task Title</strong>
    <p>Task description</p>
    <span class="badge bg-success">Completed</span>
  </div>
</div>
```

#### Log Box
```html
<div class="log-box">
  <p>[2024-02-04 10:30:45] User logged in</p>
  <p>[2024-02-04 10:31:12] Task created</p>
</div>
```

### Notifications
```html
<div class="notifications-panel">
  <p>✓ Task assigned successfully</p>
  <p>📊 New team member added</p>
</div>
```

---

## Responsive Design

### Breakpoints

#### Desktop (1024px+)
- Full features enabled
- Multi-column layouts
- All UI elements visible
- Hover effects active

#### Tablet (768-1023px)
```css
.stats-grid { grid-template-columns: 1fr; }
.attendance-buttons { grid-template-columns: 1fr 1fr; }
.dashboard-header { flex-direction: column; }
```

#### Mobile (480-767px)
```css
.theme-toggle { top: 10px; right: 10px; padding: 8px 12px; }
.auth-container { padding: 16px; }
.attendance-buttons { grid-template-columns: 1fr; }
.card { padding: 16px; }
```

#### Extra Small (<480px)
- Single column layouts
- Minimal padding
- Touch-friendly elements (min 44px)
- Stacked buttons

### Responsive Images
```html
<!-- Flexible images -->
<img src="image.png" style="width: 100%; height: auto;" />
```

### Media Query Examples
```css
@media (max-width: 1024px) {
  .dashboard-wrapper { padding-top: 70px; }
}

@media (max-width: 768px) {
  .dashboard-header { flex-direction: column; }
  .stats-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .theme-toggle { top: 10px; right: 10px; }
  .btn-lg { padding: 12px 16px; }
}
```

---

## Theme Integration

### Switching Themes
```javascript
// Toggle dark/light theme
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  // Save preference
  localStorage.setItem('theme', 
    document.body.classList.contains('light-theme') ? 'light' : 'dark'
  );
}
```

### Light Theme Override
```css
body.light-theme {
  background: var(--bg-light);
  color: var(--text-light);
}

body.light-theme .component {
  background: var(--card-light);
  border-color: var(--border-light);
}
```

### Using Theme Variables
```html
<!-- Color automatically adapts to theme -->
<div class="card">This uses var(--card-dark) or var(--card-light)</div>

<!-- Text color adapts -->
<p class="text-muted">This text adapts to theme</p>

<!-- Background adapts -->
<div class="log-box">Theme-aware background</div>
```

---

## Animation Classes

### Entrance Animations
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Usage
```html
<div class="auth-container" style="animation: slideUp 0.4s ease-out;">
  ...
</div>
```

---

## Accessibility Features

### Focus States
```css
.form-control:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
```

### Color Contrast
- Text: 7:1 minimum ratio (WCAG AAA)
- Buttons: 4.5:1 minimum ratio (WCAG AA)
- Interactive elements: Clear visual distinction

### Keyboard Navigation
- All buttons and links accessible via Tab
- Focus indicators visible
- Enter key triggers buttons

### Semantic HTML
```html
<button>    <!-- Instead of <div onclick> -->
<label>     <!-- For form fields -->
<nav>       <!-- Navigation sections -->
<main>      <!-- Main content -->
<article>   <!-- Content sections -->
```

---

## Best Practices

✅ **Do**
- Use CSS variables for consistency
- Follow mobile-first approach
- Use semantic HTML
- Test on multiple devices
- Minimize custom colors
- Use system fonts
- Maintain consistent spacing

❌ **Don't**
- Hardcode colors (use variables)
- Create unnecessary classes
- Use inline styles (use CSS classes)
- Forget accessibility
- Use too many font sizes
- Break responsive layouts
- Ignore border radius consistency

---

## Maintenance Notes

- All colors defined in `:root` CSS variables
- Responsive breakpoints: 1024px, 768px, 480px
- Animation duration: 0.3s - 0.6s (avoid too fast)
- Shadow depth: subtle and lg only
- Grid gaps: 8px, 12px, 16px, 24px scale

---

**Document Version:** 1.0  
**Last Updated:** February 4, 2026  
**Status:** ✅ Production Ready
