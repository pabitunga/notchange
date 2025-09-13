/* ===========================================
   FacultyJobs – app.js (Firebase COMPAT SDK)
   - Uses your NEW firebaseConfig
   - Pages always clickable (no hard errors)
   - Candidate can post (pending)
   - Employer/Admin posts live immediately
   - Center toasts (no blocking OK dialog)
   - Closing Soon / All / Archive lists
   - Multi-select Dept/Level + optional image
   =========================================== */

"use strict";

/* -------- Firebase Init (compat) -------- */
(function initFirebase() {
  // Your NEW config
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCBQfwpbnDdPPl0LdeXPWAc_o-Nd67EnsY",
  authDomain: "jobs-ff5a9.firebaseapp.com",
  projectId: "jobs-ff5a9",
  storageBucket: "jobs-ff5a9.firebasestorage.app",
  messagingSenderId: "110232650978",
  appId: "1:110232650978:web:5db3690656cebec37f8abb",
  measurementId: "G-86JGB6073W"
};

  try {
    if (window.firebase && window.firebase.initializeApp) {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }
    } else {
      console.error("[Firebase] SDK not loaded. Check index.html <script> tags.");
    }
  } catch (e) {
    console.error("[Firebase] init error:", e);
  }
})();

// Safe handles even if Firebase not ready
var auth = (window.firebase && window.firebase.auth) ? window.firebase.auth() : null;
var db   = (window.firebase && window.firebase.firestore) ? window.firebase.firestore() : null;

/* ---------------- Global State ---------------- */
var currentUser = null;
var isAuthenticated = false;

/* Config */
var NEAR_EXPIRY_DAYS = 7;

/* ---------------- Helpers ---------------- */
function $(id) { return document.getElementById(id); }
function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function safeGetValue(id) { var el = $(id); return el ? el.value : ""; }
function ensureFirebase(service) {
  var ok = !!(window.firebase && auth && db);
  if (!ok) showToast((service || "Firebase") + " isn’t ready. Check SDK & config.", "error", 3000);
  return ok;
}
function escapeHtml(str){
  return (str || "").replace(/[&<>"']/g, function(s){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]); });
}

/* --- Toasts (center, non-blocking) --- */
function ensureToastContainer() {
  var c = $("toastContainer");
  if (!c) {
    c = document.createElement("div");
    c.id = "toastContainer";
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  return c;
}
function showToast(message, type, duration) {
  if (duration == null) duration = 2000;
  var container = ensureToastContainer();
  var el = document.createElement("div");
  el.className = "toast " + (type === "success" ? "toast--success" : type === "error" ? "toast--error" : "toast--info");
  el.textContent = message;
  container.appendChild(el);
  setTimeout(function(){
    el.classList.add("toast--hide");
    setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 300);
  }, duration);
}
function showAlert(msg, type){ showToast(msg, type || "info", 2000); }
// Convert any stray alert() to our toast
try { window.alert = function(m){ showToast(String(m), "info", 2000); }; } catch(e){}

/* --- Date helpers --- */
function parseDeadline(dstr){
  if (!dstr) return null;
  var d = new Date(dstr);
  if (isNaN(d.getTime())) return null;
  d.setHours(23,59,59,999);
  return d;
}
function now(){ return new Date(); }
function isExpired(job){
  var d = parseDeadline(job && job.deadline);
  return !!(d && d.getTime() < now().getTime());
}
function daysLeft(job){
  var d = parseDeadline(job && job.deadline);
  if (!d) return null;
  var ms = d.getTime() - now().getTime();
  return Math.ceil(ms / (1000*60*60*24));
}
function formatDateDisplay(iso){
  if (!iso) return "";
  var parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

/* --- Session --- */
function saveSession() {
  try {
    localStorage.setItem("fj:isAuthenticated", JSON.stringify(isAuthenticated));
    localStorage.setItem("fj:currentUser", JSON.stringify(currentUser));
  } catch(e){}
}
function loadSession() {
  try {
    isAuthenticated = JSON.parse(localStorage.getItem("fj:isAuthenticated")) || false;
    currentUser = JSON.parse(localStorage.getItem("fj:currentUser")) || null;
  } catch(e){ isAuthenticated = false; currentUser = null; }
}
function clearSession() {
  try {
    localStorage.removeItem("fj:isAuthenticated");
    localStorage.removeItem("fj:currentUser");
  } catch(e){}
}

/* --- Navigation --- */
function showPage(name) {
  qsa(".page").forEach(function(p){ p.classList.add("hidden"); });
  var map = {
    home: "homePage", jobs: "jobsPage", about: "aboutPage",
    archive: "archivePage",
    signup: "signupPage", signin: "signinPage",
    dashboard: "dashboardPage", "post-job": "postJobPage",
    admin: "adminPage", profile: "profilePage"
  };
  var id = map[name] || "homePage";
  var el = $(id);
  if (el) el.classList.remove("hidden");
  if (name === "dashboard" && !isAuthenticated) {
    showToast("Please sign in to access your dashboard.", "info", 2500);
    showPage("signin");
  }
}
function updateNavigation() {
  var anon = $("anonymousNav");
  var authd = $("authenticatedNav");
  if (isAuthenticated && currentUser) {
    if (anon) anon.classList.add("hidden");
    if (authd) authd.classList.remove("hidden");
    var userName = $("userName");
    var userRole = $("userRole");
    var userPhoto = $("userPhoto");
    if (userName) userName.textContent = currentUser.name || "User";
    if (userRole) userRole.textContent = currentUser.role || "Candidate";
    if (userPhoto && currentUser.photo) userPhoto.src = currentUser.photo;
    var adminLink = qsa(".nav__admin")[0];
    if (adminLink) {
      if (currentUser.role === "ADMIN") adminLink.classList.remove("hidden");
      else adminLink.classList.add("hidden");
    }
  } else {
    if (authd) authd.classList.add("hidden");
    if (anon) anon.classList.remove("hidden");
  }
}

/* --- User Dropdown --- */
function toggleUserDropdown() {
  var dd = $("userDropdown");
  if (dd) dd.classList.toggle("hidden");
}
document.addEventListener("click", function(e){
  var dd = $("userDropdown"), trigger = $("userPhoto");
  if (dd && trigger && !dd.contains(e.target) && !trigger.contains(e.target)) dd.classList.add("hidden");
});

/* ================== AUTH ================== */
function sendVerificationEmail(user) {
  if (!user || !user.sendEmailVerification) return Promise.resolve();
  return user.sendEmailVerification().catch(function(err){ console.warn("sendEmailVerification error:", err); });
}
function handleUnverifiedSignIn(user) {
  return sendVerificationEmail(user).then(function(){
    showToast("We sent a verification link. Please verify, then sign in again.", "info", 3000);
    if (auth && auth.signOut) return auth.signOut();
  }).finally(function(){
    isAuthenticated = false; currentUser = null; clearSession(); updateNavigation(); showPage("signin");
  });
}
function signUp(formData) {
  if (!ensureFirebase("Authentication")) return;
  auth.createUserWithEmailAndPassword(formData.email, formData.password)
    .then(function(cred){
      var user = cred.user;
      var selected = (formData.role || "CANDIDATE").toUpperCase();
      var initialRole = selected === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";
      return db.collection("users").doc(user.uid).set({
        name: formData.name || "",
        role: initialRole,
        institution: formData.institution || "",
        photo: formData.photo || null,
        email: user.email || null,
        createdAt: new Date().toISOString()
      }).then(function(){ return sendVerificationEmail(user); });
    })
    .then(function(){
      showToast("Verification email sent. Please verify, then sign in.", "success", 2500);
      if (auth && auth.signOut) return auth.signOut();
    })
    .catch(function(err){
      showToast("Sign up error: " + (err && err.message ? err.message : err), "error", 3000);
    })
    .finally(function(){
      isAuthenticated = false; currentUser = null; clearSession(); updateNavigation(); showPage("signin");
    });
}
function signIn(email, password) {
  if (!ensureFirebase("Authentication")) return;
  auth.signInWithEmailAndPassword(email, password)
    .then(function(cred){
      var user = cred.user;
      if (!user.emailVerified) return handleUnverifiedSignIn(user);
      return db.collection("users").doc(user.uid).get().then(function(doc){
        var userData = doc.exists ? (doc.data() || {}) : {};
        currentUser = {
          id: user.uid,
          name: userData.name || "User",
          email: user.email,
          role: userData.role || "CANDIDATE",
          institution: userData.institution || "",
          photo: userData.photo || null
        };
        isAuthenticated = true;
        saveSession();
        updateNavigation();
        showToast("Welcome back!", "success", 2000); // center toast
        showPage("dashboard");
      });
    })
    .catch(function(err){
      showToast("Sign in error: " + (err && err.message ? err.message : err), "error", 3000);
    });
}
function signOut() {
  if (auth && auth.signOut) auth.signOut().catch(function(){});
  isAuthenticated = false; currentUser = null; clearSession(); updateNavigation(); showPage("home");
}
function forgotPassword(email) {
  if (!ensureFirebase("Authentication")) return;
  auth.sendPasswordResetEmail(email)
    .then(function(){ showToast("Password reset email sent to " + email + ".", "success", 2500); })
    .catch(function(err){ showToast("Reset error: " + (err && err.message ? err.message : err), "error", 3000); });
}

/* ---------- Photo Upload & Profile ---------- */
function wirePhotoUpload() {
  var upload = $("photoUpload");
  var previewImg = $("photoPreview");
  var ph = $("photoPlaceholder");
  if (upload) {
    upload.addEventListener("change", function(e){
      var file = e.target.files && e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        if (previewImg) { previewImg.src = reader.result; previewImg.classList.remove("hidden"); }
        if (ph) ph.classList.add("hidden");
      };
      reader.readAsDataURL(file);
    });
  }
  var profileUpload = $("profilePhotoUpload");
  var currentPhoto = $("currentPhoto");
  if (profileUpload) {
    profileUpload.addEventListener("change", function(e){
      var file = e.target.files && e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        if (currentPhoto) currentPhoto.src = reader.result;
        if (isAuthenticated && currentUser) {
          currentUser.photo = reader.result; saveSession(); updateNavigation();
          if (db) { db.collection("users").doc(currentUser.id).update({ photo: reader.result }).catch(function(){}); }
        }
      };
      reader.readAsDataURL(file);
    });
  }
}
function wireProfileForm() {
  var form = $("profileForm"); if (!form) return;
  form.addEventListener("submit", function(e){
    e.preventDefault();
    if (!isAuthenticated || !currentUser) { showToast("Please sign in.", "info", 2000); return; }
    var name = safeGetValue("profileName");
    var institution = safeGetValue("profileInstitution");
    currentUser.name = name || currentUser.name;
    currentUser.institution = institution || currentUser.institution;
    saveSession(); updateNavigation();
    if (db) db.collection("users").doc(currentUser.id).update({ name: currentUser.name, institution: currentUser.institution }).catch(function(){});
    showToast("Profile saved!", "success", 1800);
  });
}
function handlePostJob() {
  if (!isAuthenticated) {
    showToast("Please sign in to post a job.", "info", 2500);
    showPage("signin");
    return;
  }
  showPage("post-job"); // Candidates allowed (their posts become pending)
  var r = (currentUser && currentUser.role ? currentUser.role : "").toUpperCase();
  if (["EMPLOYER", "EMPLOYER_PENDING", "ADMIN"].indexOf(r) === -1) {
    showToast("Note: your job will go live after admin approval.", "info", 3000);
  }
}

/* ================== JOBS (Realtime + Moderation + Archive) ================== */

// Multi-select helper
function getMultiSelectValues(id){
  var el = $(id);
  if (!el) return [];
  var out = [];
  for (var i=0; i<el.options.length; i++){
    if (el.options[i].selected) out.push(el.options[i].value);
  }
  return out;
}

// (Optional) client resize for preview only
function compressImageToDataURL(file, maxW, maxH, quality){
  return new Promise(function(resolve){
    if (!file) return resolve(null);
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        maxW = maxW || 1280; maxH = maxH || 1280; quality = quality || 0.8;
        var targetW = w, targetH = h;
        if (w > maxW || h > maxH) {
          var ratio = Math.min(maxW / w, maxH / h);
          targetW = Math.round(w * ratio);
          targetH = Math.round(h * ratio);
        }
        var canvas = document.createElement("canvas");
        canvas.width = targetW; canvas.height = targetH;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, targetW, targetH);
        try { resolve(canvas.toDataURL("image/jpeg", quality)); }
        catch(e){ resolve(reader.result); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function wirePostImage(){
  var input = $("postJobImage");
  var preview = $("postJobImagePreview");
  if (!input) return;
  input.addEventListener("change", function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    compressImageToDataURL(file, 1280, 1280, 0.8).then(function(dataUrl){
      if (preview) { preview.src = dataUrl; preview.classList.remove("hidden"); }
      input.dataset.dataUrl = dataUrl || "";
    });
  });
}

/* Card UI */
function jobCardHTML(j, opts){
  opts = opts || {};
  var desc = (j.description || "");
  var short = desc.length > 180 ? desc.slice(0,180) + "…" : desc;

  var depts = Array.isArray(j.departments) ? j.departments
            : (j.department ? [j.department] : []);
  var levels = Array.isArray(j.levels) ? j.levels
            : (j.level ? [j.level] : []);

  var deptText  = depts.length ? depts.join(", ") : "—";
  var levelText = levels.length ? levels.join(", ") : "—";

  var expireDays = daysLeft(j);
  var expired = opts.expired || isExpired(j);
  var near = !expired && expireDays != null && expireDays >= 0 && expireDays <= NEAR_EXPIRY_DAYS;

  var badge = "";
  if (expired) {
    badge = '<span class="status" style="background:#fee2e2;color:#991b1b">Expired</span>';
  } else if (near) {
    var text = (expireDays === 0) ? "Deadline: Today" : ("Deadline: " + expireDays + " day" + (expireDays===1?"":"s") + " left");
    badge = '<span class="status">' + escapeHtml(text) + '</span>';
  }

  var deadlineText = j.deadline ? formatDateDisplay(j.deadline) : null;
  var deadlineLine = deadlineText
    ? '<div class="text-sm" style="color:var(--text-muted);margin-top:6px;">Deadline: ' + escapeHtml(deadlineText) + '</div>'
    : "";

  var img = j.image ? '<img src="' + j.image + '" alt="Job image" class="job-image">' : "";

  var applyBtn = j.applicationLink
    ? '<a class="btn btn--primary btn--sm" href="' + escapeHtml(j.applicationLink) + '" target="_blank" rel="noopener">Apply</a>'
    : '<button class="btn btn--primary btn--sm" onclick="showToast(\'Apply flow coming soon!\', \'info\', 1500)">Apply</button>';

  return (
    '<div class="card">' +
      '<div class="card__body">' +
        img +
        '<h3>' + escapeHtml(j.title) + '</h3>' +
        '<p>' + escapeHtml(j.institution) + ' • ' + escapeHtml(j.location) + '</p>' +
        '<div class="text-sm" style="color:var(--text-muted); margin-top:4px;">' +
          escapeHtml(deptText) + ' • ' + escapeHtml(levelText) +
        '</div>' +
        deadlineLine +
        '<div style="margin-top:8px">' + badge + '</div>' +
        '<p style="margin-top:8px">' + escapeHtml(short) + '</p>' +
        '<div class="mt-8">' +
          applyBtn +
          '<button class="btn btn--outline btn--sm mx-8" onclick="showToast(\'Saved!\', \'success\', 1200)">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

/* Renderers */
function renderAllPositions(jobs){
  var el = $("allPositions");
  if (!el) return;
  el.innerHTML = jobs.length ? jobs.map(function(j){ return jobCardHTML(j); }).join("")
                             : '<p style="color:var(--text-muted)">No jobs posted yet.</p>';
}
function renderNearExpiryPositions(jobs){
  var el = $("nearExpiryPositions");
  if (!el) return;
  var top6 = jobs.slice(0,6);
  el.innerHTML = top6.length ? top6.map(function(j){ return jobCardHTML(j, {near:true}); }).join("")
                             : '<p style="color:var(--text-muted)">No closing-soon jobs.</p>';
}
function renderArchivePositions(jobs){
  var el = $("archivePositions");
  if (!el) return;
  el.innerHTML = jobs.length ? jobs.map(function(j){ return jobCardHTML(j, {expired:true}); }).join("")
                             : '<p style="color:var(--text-muted)">Nothing in archive yet.</p>';
}

/* Post form */
function wirePostJobForm(){
  var form = $("postJobForm"); if (!form) return;

  form.addEventListener("submit", function(e){
    e.preventDefault();
    if (!isAuthenticated) { showToast("Please sign in to post a job.", "info", 2500); showPage("signin"); return; }

    var role = (currentUser && currentUser.role ? currentUser.role : "CANDIDATE").toUpperCase();
    var isPrivileged = ["EMPLOYER", "EMPLOYER_PENDING", "ADMIN"].indexOf(role) !== -1;

    var departments = getMultiSelectValues("postDepartments");
    var levels = getMultiSelectValues("postLevels");
    var deadlineISO = ( $("postDeadline") && $("postDeadline").value || "" ).trim();

    var applyLink = ( $("postApplyLink") && $("postApplyLink").value || "" ).trim();
    var institutionType = ( $("postInstitutionType") && $("postInstitutionType").value || "" ).trim();
    var imageDataUrl = ( $("postJobImage") && $("postJobImage").dataset && $("postJobImage").dataset.dataUrl ) || null;

    var job = {
      title: safeGetValue("postTitle").trim(),
      departments: departments,
      levels: levels,
      description: safeGetValue("postDescription").trim(),
      institutionType: institutionType,
      institution: safeGetValue("postInstitution").trim(),
      location: safeGetValue("postLocation").trim(),
      applicationLink: applyLink || null,
      salaryRange: safeGetValue("postSalary").trim(),
      deadline: deadlineISO,
      image: imageDataUrl || null,

      createdAt: (window.firebase && window.firebase.firestore)
                 ? window.firebase.firestore.FieldValue.serverTimestamp() : null,
      postedBy: currentUser ? currentUser.id : null,
      postedByName: currentUser ? (currentUser.name || "") : "",
      postedByInstitution: currentUser ? (currentUser.institution || "") : "",
      active: true,
      archived: false,
      approved: isPrivileged,               // Employer/Admin live immediately
      approvedBy: isPrivileged && currentUser ? currentUser.id : null,
      approvedAt: null
    };

    // Validation
    if (!job.title) { showToast("Please enter a Position Title.", "error", 1800); return; }
    if (!departments.length) { showToast("Select at least one Department.", "error", 1800); return; }
    if (!levels.length) { showToast("Select at least one Position Level.", "error", 1800); return; }
    if (!job.description) { showToast("Please write the Description.", "error", 1800); return; }
    if (!job.institution) { showToast("Please enter Institution Name.", "error", 1800); return; }
    if (!job.location) { showToast("Please enter Location.", "error", 1800); return; }
    if (!deadlineISO) { showToast("Please select Application Deadline.", "error", 1800); return; }
    if (!ensureFirebase("Firestore")) return;

    db.collection("jobs").add(job).then(function(){
      showToast(isPrivileged ? "Job posted and visible to everyone." : "Job submitted; visible after admin approval.", "success", 2500);
      form.reset();
      var preview = $("postJobImagePreview"); if (preview) { preview.src = ""; preview.classList.add("hidden"); }
      var inputImg = $("postJobImage"); if (inputImg && inputImg.dataset) delete inputImg.dataset.dataUrl;
      showPage("jobs");
    }).catch(function(err){
      showToast("Error posting job: " + (err && err.message ? err.message : err), "error", 3000);
    });
  });
}

/* ----- Infer poster roles for legacy docs (missing 'approved') ----- */
var _roleCache = {}; // uid -> role
function fetchPosterRolesFor(jobs){
  return new Promise(function(resolve){
    if (!db) return resolve({});
    var need = {};
    jobs.forEach(function(j){ if (j.postedBy && !_roleCache[j.postedBy]) need[j.postedBy] = true; });
    var keys = Object.keys(need);
    if (!keys.length) return resolve({});
    var pending = 0;
    keys.forEach(function(uid){
      pending++;
      db.collection("users").doc(uid).get().then(function(doc){
        _roleCache[uid] = doc.exists ? ((doc.data() && doc.data().role) || "CANDIDATE") : "CANDIDATE";
      }).catch(function(){ _roleCache[uid] = "CANDIDATE"; }).finally(function(){
        pending--; if (!pending) resolve({});
      });
    });
    if (!keys.length) resolve({});
  });
}

/* Realtime feed + Auto-archive */
var jobsUnsub = null;
function maybeAutoArchiveExpired(all){
  if (!db || !isAuthenticated) return Promise.resolve();
  var canTouch = function(j){ return (currentUser && currentUser.role === "ADMIN") || (currentUser && j.postedBy === currentUser.id); };
  var batch = db.batch();
  var changes = 0;

  all.forEach(function(j){
    if (isExpired(j) && (j.archived !== true || j.active !== false)) {
      if (canTouch(j)) {
        var ref = db.collection("jobs").doc(j.id);
        batch.update(ref, {
          archived: true,
          active: false,
          expiredAt: (window.firebase && window.firebase.firestore) ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        });
        changes++;
      }
    }
  });

  if (!changes) return Promise.resolve();
  return batch.commit().catch(function(e){ console.warn("Auto-archive failed:", e); });
}
function subscribeToJobs(){
  if (!db) return;
  try { if (jobsUnsub) jobsUnsub(); } catch(e){}

  jobsUnsub = db.collection("jobs").orderBy("createdAt", "desc").onSnapshot(function(snap){
    var all = snap.docs.map(function(d){ var data = d.data(); data.id = d.id; return data; });

    fetchPosterRolesFor(all).then(function(){
      // compute effective approval (legacy docs support)
      function isEffectivelyApproved(j){
        if (j.approved === true) return true;
        if (j.approved === false) return false;
        var r = _roleCache[j.postedBy] || "CANDIDATE";
        return (r === "EMPLOYER" || r === "ADMIN");
      }

      // Auto-archive (best-effort; don't block UI)
      maybeAutoArchiveExpired(all);

      // Home "Closing Soon"
      var publicApprovedActive = all.filter(function(j){
        return isEffectivelyApproved(j) && j.active !== false && j.archived !== true && !isExpired(j);
      });
      var near = publicApprovedActive
        .map(function(j){ return { j: j, left: daysLeft(j) }; })
        .filter(function(x){ return x.left != null && x.left >= 0 && x.left <= NEAR_EXPIRY_DAYS; })
        .sort(function(a,b){ return a.left - b.left; })
        .map(function(x){ return x.j; });
      renderNearExpiryPositions(near);

      // Jobs page visibility
      var isAdmin = isAuthenticated && currentUser && currentUser.role === "ADMIN";
      var visible = all.filter(function(j){
        if (j.archived === true) return false;
        if (isExpired(j)) return false;
        if (isAdmin) return true;
        if (isEffectivelyApproved(j) && j.active !== false) return true;
        if (isAuthenticated && currentUser && j.postedBy === currentUser.id) return true;
        return false;
      });
      renderAllPositions(visible);

      // Archive
      var archivedList = all.filter(function(j){ return j.archived === true || isExpired(j); });
      renderArchivePositions(archivedList);
    });
  }, function(err){
    console.warn("Jobs listener error:", err);
  });
}

/* ----- Admin Pending (only if you show it) ----- */
var pendingUnsub = null;
function pendingJobCardHTML(j){
  var short = (j.description || "");
  if (short.length > 140) short = short.slice(0,140) + "…";
  return (
    '<div class="card"><div class="card__body">' +
      '<h3>' + escapeHtml(j.title) + '</h3>' +
      '<p>' + escapeHtml(j.institution) + ' • ' + escapeHtml(j.location) + '</p>' +
      '<div style="color:var(--text-muted);margin:6px 0;">' +
        escapeHtml(Array.isArray(j.departments)?j.departments.join(", "):(j.department||"—")) + ' • ' +
        escapeHtml(Array.isArray(j.levels)?j.levels.join(", "):(j.level||"—")) +
      '</div>' +
      '<div class="text-sm" style="color:var(--text-muted);margin-top:6px;">Deadline: ' + escapeHtml(j.deadline || "—") + '</div>' +
      '<p>' + escapeHtml(short) + '</p>' +
      '<div class="mt-8">' +
        '<button class="btn btn--primary btn--sm" onclick="approveJob(\'' + j.id + '\')">Approve</button>' +
        '<button class="btn btn--outline btn--sm mx-8" onclick="rejectJob(\'' + j.id + '\')">Reject</button>' +
      '</div>' +
    '</div></div>'
  );
}
function renderPendingJobs(jobs){
  var host = $("pendingJobsList"); if (!host) return;
  host.innerHTML = jobs.length ? jobs.map(pendingJobCardHTML).join("")
                               : '<p style="color:var(--text-muted)">No jobs waiting for approval.</p>';
}
function subscribePendingJobs(){
  if (!db) return;
  try { if (pendingUnsub) pendingUnsub(); } catch(e){}
  pendingUnsub = db.collection("jobs").orderBy("createdAt", "desc").onSnapshot(function(snap){
    var all = snap.docs.map(function(d){ var data = d.data(); data.id = d.id; return data; });
    var pending = all.filter(function(j){ return j.active !== false && j.approved !== true; });
    renderPendingJobs(pending);
  }, function(err){ console.warn("Pending listener error:", err); });
}
function approveJob(id){
  if (!(isAuthenticated && currentUser && currentUser.role === "ADMIN")) { showToast("Only admins can approve.", "error", 1800); return; }
  db.collection("jobs").doc(id).update({
    approved: true,
    approvedBy: currentUser.id,
    approvedAt: (window.firebase && window.firebase.firestore) ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
  }).catch(function(e){ showToast("Approve failed: " + (e && e.message ? e.message : e), "error", 2800); });
}
function rejectJob(id){
  if (!(isAuthenticated && currentUser && currentUser.role === "ADMIN")) { showToast("Only admins can reject.", "error", 1800); return; }
  db.collection("jobs").doc(id).update({ active: false, approved: false })
    .catch(function(e){ showToast("Reject failed: " + (e && e.message ? e.message : e), "error", 2800); });
}

/* ---------- Profile hydrate ---------- */
function hydrateProfileForm() {
  if (!currentUser) return;
  var profileName = $("profileName");
  var profileEmail = $("profileEmail");
  var profileInstitution = $("profileInstitution");
  var currentPhoto = $("currentPhoto");
  if (profileName) profileName.value = currentUser.name || "";
  if (profileEmail) profileEmail.value = currentUser.email || "";
  if (profileInstitution) profileInstitution.value = currentUser.institution || "";
  if (currentPhoto && currentUser.photo) currentPhoto.src = currentUser.photo;
}

/* Forms (auth) */
function wireAuthForms() {
  var signupForm = $("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", function(e){
      e.preventDefault();
      var name = safeGetValue("signupName");
      var email = safeGetValue("signupEmail");
      var password = safeGetValue("signupPassword");
      var role = safeGetValue("signupRole") || "CANDIDATE";
      var institution = safeGetValue("signupInstitution") || "";
      var photo = null;
      var preview = $("photoPreview");
      if (preview && preview.src && !preview.classList.contains("hidden")) photo = preview.src;
      if (!email || !password) { showToast("Please enter email and password.", "error", 1800); return; }
      signUp({ name: name, email: email, password: password, role: role, institution: institution, photo: photo });
    });
  }
  var signinForm = $("signinForm");
  if (signinForm) {
    signinForm.addEventListener("submit", function(e){
      e.preventDefault();
      var email = safeGetValue("signinEmail");
      var password = safeGetValue("signinPassword");
      if (!email || !password) { showToast("Please enter email and password.", "error", 1800); return; }
      signIn(email, password);
    });
    // Forgot password convenience button
    var card = document.querySelector("#signinPage .auth-card");
    if (card && !$("forgotPasswordBtn")) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = "forgotPasswordBtn";
      btn.className = "btn btn--secondary btn--full-width";
      btn.style.marginTop = "10px";
      btn.textContent = "Forgot password? Email me a reset link";
      btn.onclick = function(){
        var email = prompt("Enter your account email:");
        if (email) forgotPassword(email.trim());
      };
      card.appendChild(btn);
    }
  }
}

/* --------------- On Load --------------- */
document.addEventListener("DOMContentLoaded", function(){
  loadSession();

  if (auth && typeof auth.onAuthStateChanged === "function") {
    auth.onAuthStateChanged(function(user){
      if (user && user.emailVerified) {
        db && db.collection("users").doc(user.uid).get().then(function(doc){
          var userData = doc.exists ? (doc.data() || {}) : {};
          currentUser = {
            id: user.uid,
            name: userData.name || (currentUser && currentUser.name) || "User",
            email: user.email || (currentUser && currentUser.email) || "",
            role: userData.role || (currentUser && currentUser.role) || "CANDIDATE",
            institution: userData.institution || (currentUser && currentUser.institution) || "",
            photo: userData.photo || (currentUser && currentUser.photo) || null
          };
          isAuthenticated = true; saveSession();
          updateNavigation(); hydrateProfileForm();
        }).catch(function(){
          isAuthenticated = true; saveSession(); updateNavigation(); hydrateProfileForm();
        });
      } else {
        loadSession(); updateNavigation(); hydrateProfileForm();
      }
    });
  } else {
    updateNavigation(); hydrateProfileForm();
  }

  wireAuthForms();
  wirePhotoUpload();
  wireProfileForm();
  wirePostImage();
  wirePostJobForm();
  subscribeToJobs();
});

/* ---------- Expose for HTML onclick ---------- */
window.showPage = showPage;
window.toggleUserDropdown = toggleUserDropdown;
window.signOut = signOut;
window.handlePostJob = handlePostJob;
window.approveJob = approveJob;
window.rejectJob = rejectJob;
