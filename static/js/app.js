(function () {
  const API = "/api/complaints/";

  const els = {
    authNav: document.getElementById("authNav"),
    userNav: document.getElementById("userNav"),
    userLabel: document.getElementById("userLabel"),
    adminBadge: document.getElementById("adminBadge"),
    sectionAuth: document.getElementById("sectionAuth"),
    sectionApp: document.getElementById("sectionApp"),
    message: document.getElementById("message"),
    formLogin: document.getElementById("formLogin"),
    formRegister: document.getElementById("formRegister"),
    formComplaint: document.getElementById("formComplaint"),
    listMine: document.getElementById("listMine"),
    listPending: document.getElementById("listPending"),
    emptyMine: document.getElementById("emptyMine"),
    emptyPending: document.getElementById("emptyPending"),
    pendingLoadSentinel: document.getElementById("pendingLoadSentinel"),
    btnLoadMore: document.getElementById("btnLoadMore"),
    btnLogout: document.getElementById("btnLogout"),
    btnShowLogin: document.getElementById("btnShowLogin"),
    btnShowRegister: document.getElementById("btnShowRegister"),
    imageModal: document.getElementById("imageModal"),
    imageModalImg: document.getElementById("imageModalImg"),
    imageModalBackdrop: document.getElementById("imageModalBackdrop"),
    imageModalClose: document.getElementById("imageModalClose"),
  };

  function openImageModal(src) {
    if (!els.imageModal || !els.imageModalImg) return;
    els.imageModalImg.src = src;
    els.imageModalImg.alt = "Complaint photo";
    els.imageModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeImageModal() {
    if (!els.imageModal || !els.imageModalImg) return;
    els.imageModal.classList.add("hidden");
    els.imageModalImg.src = "";
    els.imageModalImg.alt = "";
    document.body.style.overflow = "";
  }

  if (els.imageModalBackdrop) {
    els.imageModalBackdrop.addEventListener("click", closeImageModal);
  }
  if (els.imageModalClose) {
    els.imageModalClose.addEventListener("click", closeImageModal);
  }
  document.addEventListener("keydown", function (e) {
    if (
      e.key === "Escape" &&
      els.imageModal &&
      !els.imageModal.classList.contains("hidden")
    ) {
      closeImageModal();
    }
  });

  let state = {
    token: localStorage.getItem("token"),
    username: localStorage.getItem("username") || "",
    isSuperuser: localStorage.getItem("isSuperuser") === "true",
  };

  // Pending complaints infinite scroll state (client-side paging UI).
  let pendingState = {
    limit: 10,
    nextKey: null,
    hasMore: true,
    loading: false,
    userScrolled: false,
  };

  function showMessage(text, type) {
    els.message.textContent = text;
    els.message.className = "message " + (type || "success");
    els.message.classList.remove("hidden");
    if (type !== "error") {
      setTimeout(function () {
        els.message.classList.add("hidden");
      }, 4000);
    }
  }

  function hideMessage() {
    els.message.classList.add("hidden");
  }

  function authHeaders(omitJsonContentType) {
    const h = {};
    if (!omitJsonContentType) h["Content-Type"] = "application/json";
    if (state.token) h.Authorization = "Token " + state.token;
    return h;
  }

  function formatError(data) {
    if (!data || typeof data !== "object") {
      return typeof data === "string" ? data : "Request failed";
    }
    if (data.detail) {
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    }
    if (data.non_field_errors && data.non_field_errors.length) {
      return data.non_field_errors.join(" ");
    }
    const parts = [];
    Object.keys(data).forEach(function (k) {
      const v = data[k];
      if (Array.isArray(v)) parts.push(k + ": " + v.join(" "));
      else if (typeof v === "string") parts.push(k + ": " + v);
    });
    return parts.length ? parts.join(" · ") : JSON.stringify(data);
  }

  async function api(path, options) {
    const opts = options || {};
    const multipart = opts.body instanceof FormData;
    const res = await fetch(API + path, {
      ...opts,
      headers: { ...authHeaders(multipart), ...(opts.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }
    if (!res.ok) {
      throw new Error(formatError(data));
    }
    return data;
  }

  function setSession(token, username, isSuperuser) {
    state.token = token;
    state.username = username || "";
    state.isSuperuser = !!isSuperuser;
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
    localStorage.setItem("username", state.username);
    localStorage.setItem("isSuperuser", state.isSuperuser ? "true" : "false");
  }

  function updateChrome() {
    const loggedIn = !!state.token;
    els.authNav.classList.toggle("hidden", loggedIn);
    els.userNav.classList.toggle("hidden", !loggedIn);
    els.sectionAuth.classList.toggle("hidden", loggedIn);
    els.sectionApp.classList.toggle("hidden", !loggedIn);
    els.userLabel.textContent = loggedIn ? state.username : "";
    els.adminBadge.classList.toggle("hidden", !loggedIn || !state.isSuperuser);
  }

  function statusClass(status) {
    if (status === "Pending") return "status-pending";
    if (status === "In Progress") return "status-progress";
    return "status-resolved";
  }

  function renderComplaintItem(c, options) {
    const opts = options || {};
    const li = document.createElement("li");
    li.className = "complaint-item";
    if (opts.thumbnailRight && c.image) {
      li.classList.add("complaint-item--thumb-right");
    }
    li.dataset.id = String(c.complaint_id);
    const title = document.createElement("h3");
    title.textContent = c.title;
    const pill = document.createElement("span");
    pill.className = "status-pill " + statusClass(c.status);
    pill.textContent = c.status;
    title.appendChild(pill);

    const meta = document.createElement("div");
    meta.className = "complaint-meta";
    meta.textContent =
      (c.created_by_username ? "From: " + c.created_by_username + " · " : "") +
      (c.category || "") +
      (c.created_at ? " · " + new Date(c.created_at).toLocaleString() : "");

    const body = document.createElement("p");
    body.textContent = c.description;

    if (opts.thumbnailRight && c.image) {
      const row = document.createElement("div");
      row.className = "complaint-item-row";
      const textCol = document.createElement("div");
      textCol.className = "complaint-item-text";
      textCol.appendChild(title);
      textCol.appendChild(meta);
      textCol.appendChild(body);
      const thumbCol = document.createElement("div");
      thumbCol.className = "complaint-thumb-col";
      const thumbBtn = document.createElement("button");
      thumbBtn.type = "button";
      thumbBtn.className = "complaint-thumb-btn";
      thumbBtn.setAttribute("aria-label", "View photo full size");
      const thumbImg = document.createElement("img");
      thumbImg.src = c.image;
      thumbImg.alt = "";
      thumbImg.loading = "lazy";
      thumbImg.decoding = "async";
      thumbBtn.appendChild(thumbImg);
      thumbBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openImageModal(c.image);
      });
      thumbCol.appendChild(thumbBtn);
      row.appendChild(textCol);
      row.appendChild(thumbCol);
      li.appendChild(row);
    } else {
      li.appendChild(title);
      li.appendChild(meta);
      li.appendChild(body);
      if (c.image) {
        const wrap = document.createElement("div");
        wrap.className = "complaint-image-wrap";
        const img = document.createElement("img");
        img.className = "complaint-image";
        img.src = c.image;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        wrap.appendChild(img);
        li.appendChild(wrap);
      }
    }

    if (opts.showUpvote) {
      const actions = document.createElement("div");
      actions.className = "admin-actions";

      const btnUpvote = document.createElement("button");
      btnUpvote.type = "button";
      btnUpvote.className = "btn btn-ghost btn-upvote";
      const upvotes =
        typeof c.upvotes === "number" ? c.upvotes : c.upvotes || 0;
      const hasUpvoted = !!c.has_upvoted;
      btnUpvote.setAttribute("aria-pressed", hasUpvoted ? "true" : "false");
      btnUpvote.classList.toggle("btn-upvoted", hasUpvoted);
      btnUpvote.textContent = hasUpvoted
        ? "✓ Voted (" + upvotes + ")"
        : "^ Upvote (" + upvotes + ")";
      btnUpvote.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        upvoteComplaint(c.complaint_id);
      });

      actions.appendChild(btnUpvote);
      li.appendChild(actions);
    }

    if (opts.showAdminActions && state.isSuperuser && c.status === "Pending") {
      const actions = document.createElement("div");
      actions.className = "admin-actions";
      const btnProgress = document.createElement("button");
      btnProgress.type = "button";
      btnProgress.className = "btn btn-progress";
      btnProgress.textContent = "Mark in progress";
      btnProgress.addEventListener("click", function () {
        updateStatus(c.id, "In Progress");
      });
      const btnResolved = document.createElement("button");
      btnResolved.type = "button";
      btnResolved.className = "btn btn-success";
      btnResolved.textContent = "Mark resolved";
      btnResolved.addEventListener("click", function () {
        updateStatus(c.id, "Resolved");
      });
      actions.appendChild(btnProgress);
      actions.appendChild(btnResolved);
      li.appendChild(actions);
    }

    return li;
  }

  async function updateStatus(id, status) {
    hideMessage();
    try {
      await api("update/" + id + "/", {
        method: "PATCH",
        body: JSON.stringify({ status: status }),
      });
      showMessage("Complaint updated.", "success");
      await refreshLists();
    } catch (e) {
      showMessage(e.message || "Update failed", "error");
    }
  }

  async function upvoteComplaint(id) {
    hideMessage();
    try {
      const res = await api("vote/" + id + "/", { method: "POST" });

      // ✅ Show correct message
      showMessage(res.message, "success");

      // ✅ Find button
      const btn = document.querySelector(`[data-id="${id}"] .btn-upvote`);

      if (btn) {
        // ✅ Update text
        btn.textContent = res.voted
          ? `✓ Voted (${res.upvotes})`
          : `^ Upvote (${res.upvotes})`;

        // ✅ Update visual state
        btn.classList.toggle("btn-upvoted", res.voted);

        // ✅ Update accessibility state
        btn.setAttribute("aria-pressed", res.voted ? "true" : "false");
      }
    } catch (e) {
      showMessage(e.message || "Upvote failed", "error");
    }
  }

  async function refreshPending(reset) {
    if (!state.token) return;

    if (reset) {
      pendingState.nextKey = null;
      pendingState.hasMore = true;
      pendingState.loading = false;
      pendingState.userScrolled = false;
      els.listPending.innerHTML = "";
      els.emptyPending.classList.add("hidden");
      if (els.btnLoadMore) els.btnLoadMore.classList.add("hidden");
    }

    if (pendingState.loading) return;
    if (!pendingState.hasMore && !reset) return;

    pendingState.loading = true;
    if (els.btnLoadMore) {
      els.btnLoadMore.textContent = "Loading...";
      els.btnLoadMore.disabled = true;
    }

    try {
      let url = "pending/?limit=" + pendingState.limit;
      if (pendingState.nextKey) {
        url += "&last_key=" + encodeURIComponent(pendingState.nextKey);
      }
      const pendingResp = await api(url);
      const pendArr = Array.isArray(pendingResp)
        ? pendingResp
        : (pendingResp && pendingResp.results) || [];

      pendArr.forEach(function (c) {
        // Prevent duplication by checking if ID exists in list
        if (!els.listPending.querySelector(`[data-id="${c.complaint_id}"]`)) {
          els.listPending.appendChild(
            renderComplaintItem(c, {
              showAdminActions: true,
              showUpvote: true,
              thumbnailRight: true,
            }),
          );
        }
      });

      els.emptyPending.classList.toggle(
        "hidden",
        els.listPending.children.length > 0,
      );

      const nextKey =
        pendingResp && typeof pendingResp === "object"
          ? pendingResp.next_key
          : undefined;

      if (!nextKey) {
        pendingState.hasMore = false;
      } else {
        pendingState.nextKey = nextKey;
      }

      // Show/hide Load More button
      if (els.btnLoadMore) {
        els.btnLoadMore.classList.toggle("hidden", !pendingState.hasMore);
        els.btnLoadMore.textContent = "Load more";
        els.btnLoadMore.disabled = false;
      }
    } catch (e) {
      showMessage(e.message || "Could not load pending complaints", "error");
      if (els.btnLoadMore) {
        els.btnLoadMore.textContent = "Load more";
        els.btnLoadMore.disabled = false;
      }
    } finally {
      pendingState.loading = false;
    }
  }

  async function refreshLists() {
    if (!state.token) return;
    try {
      const mine = await api("list/");
      els.listMine.innerHTML = "";
      const mineArr = Array.isArray(mine) ? mine : mine.results || [];

      els.emptyMine.classList.toggle("hidden", mineArr.length > 0);

      mineArr.forEach(function (c) {
        // Upvoting is only available on the "All pending complaints" list.
        els.listMine.appendChild(
          renderComplaintItem(c, { showAdminActions: false }),
        );
      });

      await refreshPending(true);
    } catch (e) {
      showMessage(e.message || "Could not load complaints", "error");
    }
  }

  async function syncMe() {
    if (!state.token) return;
    try {
      const me = await api("auth/me/");
      state.isSuperuser = !!me.is_superuser;
      localStorage.setItem("isSuperuser", state.isSuperuser ? "true" : "false");
      updateChrome();
    } catch (_) {
      setSession(null, "", false);
      updateChrome();
    }
  }

  els.formLogin.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideMessage();
    const fd = new FormData(els.formLogin);
    try {
      const data = await api("auth/login/", {
        method: "POST",
        body: JSON.stringify({
          username: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      setSession(data.token, data.username, data.is_superuser);
      updateChrome();
      showMessage("Welcome back, " + data.username + ".", "success");
      els.formLogin.reset();
      await refreshLists();
    } catch (err) {
      showMessage(err.message || "Login failed", "error");
    }
  });

  els.formRegister.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideMessage();
    const fd = new FormData(els.formRegister);
    try {
      const data = await api("auth/register/", {
        method: "POST",
        body: JSON.stringify({
          username: fd.get("username"),
          email: fd.get("email") || "",
          password: fd.get("password"),
        }),
      });
      setSession(data.token, data.username, data.is_superuser);
      updateChrome();
      showMessage("Account created. You are logged in.", "success");
      els.formRegister.reset();
      await refreshLists();
    } catch (err) {
      showMessage(err.message || "Registration failed", "error");
    }
  });

  const complaintCategory = document.getElementById("complaintCategory");
  const categoryOtherWrap = document.getElementById("categoryOtherWrap");
  const categoryOther = document.getElementById("categoryOther");

  function syncCategoryOtherVisibility() {
    if (!complaintCategory || !categoryOtherWrap || !categoryOther) return;
    const isOther = complaintCategory.value === "__other__";
    categoryOtherWrap.classList.toggle("hidden", !isOther);
    if (!isOther) categoryOther.value = "";
  }

  if (complaintCategory) {
    complaintCategory.addEventListener("change", syncCategoryOtherVisibility);
  }

  els.formComplaint.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideMessage();
    const form = els.formComplaint;
    let category = complaintCategory ? complaintCategory.value : "";
    if (category === "__other__") {
      category = (categoryOther && categoryOther.value.trim()) || "";
      if (!category) {
        showMessage("Please specify a category for “Others”.", "error");
        return;
      }
    }
    if (!category) {
      showMessage("Please select a category.", "error");
      return;
    }
    if (category.length > 100) {
      category = category.slice(0, 100);
    }
    const fd = new FormData();
    fd.append("title", form.title.value.trim());
    fd.append("category", category);
    fd.append("description", form.description.value.trim());
    const imageInput = form.querySelector('input[name="image"]');
    if (imageInput && imageInput.files && imageInput.files[0]) {
      fd.append("image", imageInput.files[0]);
    }
    try {
      await api("create/", {
        method: "POST",
        body: fd,
      });
      showMessage("Complaint submitted.", "success");
      form.reset();
      syncCategoryOtherVisibility();
      await refreshLists();
    } catch (err) {
      showMessage(err.message || "Could not submit complaint", "error");
    }
  });

  els.btnLogout.addEventListener("click", async function () {
    hideMessage();
    try {
      if (state.token) {
        await api("auth/logout/", { method: "POST" });
      }
    } catch (_) {}
    setSession(null, "", false);
    updateChrome();
    showMessage("Logged out.", "success");
  });

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const name = tab.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      document.querySelectorAll(".form-panel").forEach(function (p) {
        p.classList.remove("active");
      });
      if (name === "login") {
        document.getElementById("formLogin").classList.add("active");
      } else {
        document.getElementById("formRegister").classList.add("active");
      }
    });
  });

  els.btnShowLogin.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === "login");
    });
    document.getElementById("formLogin").classList.add("active");
    document.getElementById("formRegister").classList.remove("active");
  });

  els.btnShowRegister.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === "register");
    });
    document.getElementById("formRegister").classList.add("active");
    document.getElementById("formLogin").classList.remove("active");
  });

  // Load next page when "Load More" button is clicked.
  if (els.btnLoadMore) {
    els.btnLoadMore.addEventListener("click", function () {
      if (!pendingState.loading && pendingState.hasMore) {
        refreshPending(false);
      }
    });
  }

  updateChrome();
  if (state.token) {
    syncMe().then(function () {
      return refreshLists();
    });
  }
})();
