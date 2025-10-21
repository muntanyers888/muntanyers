// Configuració global
let currentUser = null;
let currentPostType = 'text';
let selectedMediaFile = null;

// Inicialització
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    await checkAuth();
    setupEventListeners();
    
    // Carregar avatar si estem a settings
    if (window.location.pathname === '/settings') {
        await loadCurrentAvatar();
        setupAvatarUpload();
    }
    
    // Carregar contingut específic de cada pàgina
    const path = window.location.pathname;
    
    if (path === '/feed' || path === '/') {
        loadFeed();
        setupPostCreator();
    } else if (path === '/profile') {
        loadProfile();
    } else if (path === '/settings') {
        loadSettings();
    } else if (path === '/users') {
        setupUserSearch();
    } else if (path === '/notifications') {
        loadNotifications();
    } else if (path === '/') {
        setupHomePage();
    }
}

// Verificar autenticació
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        currentUser = data.authenticated ? data : null;
        
        // Redireccions basades en autenticació
        if (data.authenticated) {
            if (window.location.pathname === '/login') {
                window.location.href = '/feed';
            }
            updateUIForAuthenticatedUser(data);
        } else {
            if (window.location.pathname === '/feed' || window.location.pathname === '/profile' || 
                window.location.pathname === '/settings' || window.location.pathname === '/notifications') {
                window.location.href = '/login';
            }
            updateUIForGuest();
        }
    } catch (error) {
        console.error('Error verificant autenticació:', error);
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Logout
    const logoutBtns = document.querySelectorAll('#logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Botons de la pàgina principal
    const exploreBtn = document.getElementById('exploreBtn');
    const joinBtn = document.getElementById('joinBtn');
    const authBtn = document.getElementById('authBtn');
    
    if (exploreBtn) exploreBtn.addEventListener('click', () => window.location.href = '/feed');
    if (joinBtn) joinBtn.addEventListener('click', () => window.location.href = '/login');
    if (authBtn) authBtn.addEventListener('click', () => {
        window.location.href = currentUser ? '/feed' : '/login';
    });
}

// Actualitzar UI per usuari autenticat
function updateUIForAuthenticatedUser(user) {
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.textContent = '🏠 Feed';
        authBtn.onclick = () => window.location.href = '/feed';
    }
    
    // Actualitzar avatar
    const avatars = document.querySelectorAll('#currentUserAvatar, #profileAvatar, #currentAvatar');
    avatars.forEach(avatar => {
        if (avatar && user.username) {
            avatar.textContent = user.username.charAt(0).toUpperCase() + '🧗';
        }
    });
}

// Actualitzar UI per convidat
function updateUIForGuest() {
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.textContent = 'Començar Aventura';
        authBtn.onclick = () => window.location.href = '/login';
    }
}

// ===== AUTENTICACIÓ =====
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        username: formData.get('username'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            window.location.href = '/feed';
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Compte creat correctament! Redirigint...', 'success');
            setTimeout(() => {
                window.location.href = '/feed';
            }, 1500);
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        const result = await response.json();
        if (result.success) {
            window.location.href = '/';
        }
    } catch (error) {
        showNotification('Error en tancar sessió', 'error');
    }
}

// ===== CONFIGURACIÓ DEL PERFIL =====
async function loadSettings() {
    try {
        const response = await fetch('/api/user/profile');
        if (!response.ok) throw new Error('Error carregant perfil');
        
        const user = await response.json();
        
        // Omplir formularis
        document.getElementById('username').value = user.username || '';
        document.getElementById('bio').value = user.bio || '';
        document.getElementById('privateAccount').checked = user.private || false;
        
        // Actualitzar avatar
        const avatar = document.getElementById('currentAvatar');
        if (avatar && user.username) {
            avatar.textContent = user.username.charAt(0).toUpperCase() + '🧗';
        }
        
        // Configurar event listeners dels formularis
        setupSettingsForms();
        
    } catch (error) {
        console.error('Error carregant configuració:', error);
        showNotification('Error carregant la configuració', 'error');
    }
}

function setupSettingsForms() {
    // Formulari de perfil
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }
    
    // Formulari de contrasenya
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordChange);
    }
    
    // Avatar upload
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const avatarUpload = document.getElementById('avatarUpload');
    
    if (changeAvatarBtn && avatarUpload) {
        changeAvatarBtn.addEventListener('click', () => avatarUpload.click());
        avatarUpload.addEventListener('change', handleAvatarUpload);
    }
    
    // Eliminar compte
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    const deleteModal = document.getElementById('deleteModal');
    const cancelDelete = document.getElementById('cancelDelete');
    const deleteForm = document.getElementById('deleteForm');
    
    if (deleteAccountBtn && deleteModal) {
        deleteAccountBtn.addEventListener('click', () => {
            deleteModal.classList.add('show');
        });
        
        cancelDelete.addEventListener('click', () => {
            deleteModal.classList.remove('show');
        });
        
        deleteForm.addEventListener('submit', handleAccountDelete);
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    console.log('Actualitzant perfil...'); // Debug
    
    const username = document.getElementById('username').value;
    const bio = document.getElementById('bio').value;
    const privateAccount = document.getElementById('privateAccount').checked;
    
    console.log('Dades del formulari:', { username, bio, privateAccount }); // Debug
    
    if (!username || username.trim() === '') {
        showNotification('El nom d\'usuari és obligatori', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username.trim(),
                bio: bio ? bio.trim() : '',
                private: privateAccount
            })
        });
        
        console.log('Resposta del servidor:', response.status); // Debug
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error del servidor');
        }
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Perfil actualitzat correctament!', 'success');
            currentUser.username = username;
            updateUIForAuthenticatedUser(currentUser);
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error actualitzant perfil:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}   

async function handlePasswordChange(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showNotification('Les contrasenyes no coincideixen', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('La contrasenya ha de tenir almenys 6 caràcters', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/user/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Contrasenya canviada correctament!', 'success');
            document.getElementById('passwordForm').reset();
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('Selecciona una imatge vàlida', 'error');
        return;
    }
    
    // En una versió real, aquí pujaries el fitxer al servidor
    // Per ara, fem una simulació
    const reader = new FileReader();
    reader.onload = function(e) {
        const avatar = document.getElementById('currentAvatar');
        // En una versió real, enviaries aquesta data URL al servidor
        showNotification('Avatar actualitzat (simulat)', 'success');
    };
    reader.readAsDataURL(file);
}

async function handleAccountDelete(e) {
    e.preventDefault();
    
    const password = document.getElementById('deletePassword').value;
    
    try {
        const response = await fetch('/api/user', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Compte eliminat correctament', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

// ===== CERCAR USUARIS =====
function setupUserSearch() {
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleUserSearch, 300));
    }
    
    // Carregar usuaris populars inicials
    loadPopularUsers();
}

async function handleUserSearch(e) {
    const query = e.target.value.trim();
    
    if (query.length < 2) {
        loadPopularUsers();
        return;
    }
    
    try {
        const response = await fetch(`/api/users/search/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Error cercant usuaris');
        
        const users = await response.json();
        displayUsers(users);
    } catch (error) {
        console.error('Error cercant usuaris:', error);
        showNotification('Error cercant usuaris', 'error');
    }
}

async function loadPopularUsers() {
    try {
        // Simulem usuaris populars cercant una cadena buida
        const response = await fetch('/api/users/search/');
        if (!response.ok) throw new Error('Error carregant usuaris');
        
        const users = await response.json();
        displayUsers(users.slice(0, 10)); // Mostrem només els primers 10
    } catch (error) {
        console.error('Error carregant usuaris:', error);
    }
}

function displayUsers(users) {
    const usersGrid = document.getElementById('usersGrid');
    if (!usersGrid) return;
    
    if (users.length === 0) {
        usersGrid.innerHTML = '<div class="no-posts">No s\'han trobat usuaris</div>';
        return;
    }
    
    usersGrid.innerHTML = users.map(user => `
        <div class="user-card">
            <div class="user-card-avatar">${user.username ? user.username.charAt(0).toUpperCase() : '🧗'}</div>
            <div class="user-card-info">
                <div class="user-card-username">${user.username}</div>
                <div class="user-card-bio">${user.bio || 'Muntanyer apassionat'}</div>
                <div class="user-card-stats">
                    <span>${user.follower_count || 0} seguidors</span>
                </div>
            </div>
            <button class="follow-btn follow" onclick="followUser(${user.id}, this)">Seguir</button>
        </div>
    `).join('');
}

// ===== SEGUIR USUARIS =====
async function followUser(userId, button) {
    if (!currentUser) {
        showNotification('Has d\'iniciar sessió per seguir usuaris', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}/follow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (result.status === 'pending') {
                button.textContent = 'Sol·licitat';
                button.className = 'follow-btn pending';
                showNotification('Sol·licitud enviada. Esperant aprovació.', 'info');
            } else {
                button.textContent = 'Seguint';
                button.className = 'follow-btn following';
                showNotification('Ara segueixes a aquest usuari!', 'success');
            }
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

// ===== NOTIFICACIONS =====
async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications');
        if (!response.ok) throw new Error('Error carregant notificacions');
        
        const notifications = await response.json();
        displayNotifications(notifications);
        
        // Configurar botó de marcar com a llegit
        const markAllReadBtn = document.getElementById('markAllRead');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
        }
        
    } catch (error) {
        console.error('Error carregant notificacions:', error);
        showNotification('Error carregant notificacions', 'error');
    }
}

function displayNotifications(notifications) {
    const notificationsList = document.getElementById('notificationsList');
    if (!notificationsList) return;
    
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<div class="no-posts">No tens notificacions</div>';
        return;
    }
    
    notificationsList.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.read ? '' : 'unread'}">
            <div class="notification-avatar">${notification.from_username ? notification.from_username.charAt(0).toUpperCase() : '🧗'}</div>
            <div class="notification-content">
                <div class="notification-text">${getNotificationText(notification)}</div>
                <div class="notification-time">${formatDate(notification.created_at)}</div>
            </div>
            <div class="notification-actions">
                ${getNotificationActions(notification)}
            </div>
        </div>
    `).join('');
}

function getNotificationText(notification) {
    switch (notification.type) {
        case 'follow_request':
            return `<strong>${notification.from_username}</strong> vol seguir-te`;
        case 'follow_accepted':
            return `<strong>${notification.from_username}</strong> ha acceptat la teva sol·licitud`;
        case 'like':
            return `<strong>${notification.from_username}</strong> li ha agradat la teva publicació`;
        case 'comment':
            return `<strong>${notification.from_username}</strong> ha comentat la teva publicació`;
        default:
            return 'Nova notificació';
    }
}

function getNotificationActions(notification) {
    if (notification.type === 'follow_request') {
        return `
            <button class="btn btn-primary btn-small" onclick="handleFollowRequest(${notification.from_user_id}, 'accept')">Acceptar</button>
            <button class="btn btn-outline btn-small" onclick="handleFollowRequest(${notification.from_user_id}, 'reject')">Rebutjar</button>
        `;
    }
    return '';
}

async function handleFollowRequest(followerId, action) {
    try {
        const response = await fetch(`/api/followers/${followerId}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Sol·licitud ${action === 'accept' ? 'acceptada' : 'rebutjada'}`, 'success');
            loadNotifications(); // Recarregar notificacions
        } else {
            showNotification('Error gestionant la sol·licitud', 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

async function markAllNotificationsAsRead() {
    try {
        const response = await fetch('/api/notifications/read', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Totes les notificacions marcades com a llegides', 'success');
            loadNotifications(); // Recarregar notificacions
        }
    } catch (error) {
        showNotification('Error marcant notificacions', 'error');
    }
}

// ===== LIKES I COMENTARIS =====
async function toggleLike(postId, button) {
    if (!currentUser) {
        showNotification('Has d\'iniciar sessió per donar like', 'error');
        return;
    }
    
    const isLiked = button.classList.contains('liked');
    
    try {
        const url = `/api/posts/${postId}/like`;
        const method = isLiked ? 'DELETE' : 'POST';
        
        const response = await fetch(url, { method });
        const result = await response.json();
        
        if (result.success) {
            if (isLiked) {
                button.classList.remove('liked');
                button.innerHTML = '❤️ M\'agrada';
            } else {
                button.classList.add('liked');
                button.innerHTML = '❤️ M\'agrada';
            }
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

async function addComment(postId, content) {
    if (!currentUser) {
        showNotification('Has d\'iniciar sessió per comentar', 'error');
        return;
    }
    
    if (!content.trim()) {
        showNotification('Escriu un comentari', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Comentari afegit', 'success');
            // En una versió completa, actualitzaries la llista de comentaris aquí
        } else {
            showNotification('Error afegint comentari', 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

// ===== FUNCIONALITATS EXISTENTS (mantenir) =====
function setupPostCreator() {
    const mediaBtns = document.querySelectorAll('.media-btn');
    const uploadMediaBtn = document.getElementById('uploadMediaBtn');
    const mediaUpload = document.getElementById('mediaUpload');
    const publishPostBtn = document.getElementById('publishPostBtn');
    const mediaPreview = document.getElementById('mediaPreview');

    mediaBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            currentPostType = this.dataset.type;
            mediaBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            if (currentPostType === 'text') {
                mediaPreview.innerHTML = '';
                selectedMediaFile = null;
            }
            
            uploadMediaBtn.style.display = currentPostType === 'text' ? 'none' : 'inline-flex';
        });
    });

    if (uploadMediaBtn && mediaUpload) {
        uploadMediaBtn.addEventListener('click', () => mediaUpload.click());
        mediaUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                selectedMediaFile = file;
                displayMediaPreview(file);
            }
        });
    }

    if (publishPostBtn) {
        publishPostBtn.addEventListener('click', createPost);
    }
}

function displayMediaPreview(file) {
    const mediaPreview = document.getElementById('mediaPreview');
    const reader = new FileReader();
    
    reader.onload = function(e) {
        if (file.type.startsWith('image/')) {
            mediaPreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        } else if (file.type.startsWith('video/')) {
            mediaPreview.innerHTML = `<video controls src="${e.target.result}"></video>`;
        }
    };
    
    reader.readAsDataURL(file);
}

async function createPost() {
    const postContent = document.getElementById('postContent');
    const content = postContent.value.trim();
    
    if (!content && currentPostType === 'text') {
        showNotification('Escriu alguna cosa per publicar!', 'error');
        return;
    }

    if ((currentPostType === 'image' || currentPostType === 'video') && !selectedMediaFile) {
        showNotification('Selecciona una imatge o vídeo!', 'error');
        return;
    }

    try {
        let image_url = '';
        let video_url = '';
        
        if (currentPostType === 'image' && selectedMediaFile) {
            image_url = await fileToDataURL(selectedMediaFile);
        } else if (currentPostType === 'video' && selectedMediaFile) {
            video_url = await fileToDataURL(selectedMediaFile);
        }

        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                image_url: image_url,
                video_url: video_url,
                type: currentPostType
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Publicació creada!', 'success');
            postContent.value = '';
            document.getElementById('mediaPreview').innerHTML = '';
            selectedMediaFile = null;
            document.getElementById('mediaUpload').value = '';
            loadFeed();
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

function fileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        reader.readAsDataURL(file);
    });
}

async function loadFeed() {
    const feedPosts = document.getElementById('feedPosts');
    if (!feedPosts) return;

    try {
        feedPosts.innerHTML = '<div class="loading">Carregant aventures...</div>';
        
        const response = await fetch('/api/feed');
        if (!response.ok) throw new Error('Error carregant feed');
        
        const posts = await response.json();
        feedPosts.innerHTML = '';

        if (posts.length === 0) {
            feedPosts.innerHTML = `
                <div class="no-posts">
                    <h3>Encara no hi ha aventures</h3>
                    <p>Sigues el primer a compartir una experiència a la muntanya!</p>
                </div>
            `;
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post);
            feedPosts.appendChild(postElement);
        });
        
        // Actualitza avatars amb la informació actual
        updateCurrentUserAvatar();
        
    } catch (error) {
        console.error('Error carregant feed:', error);
        feedPosts.innerHTML = '<div class="no-posts">Error carregant les aventures</div>';
    }
}

// Funció per actualitzar l'avatar actual del usuari
async function updateCurrentUserAvatar() {
    try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
            const user = await response.json();
            if (user.avatar_url) {
                updateAllAvatars(user.avatar_url);
            }
        }
    } catch (error) {
        console.error('Error actualitzant avatar:', error);
    }
}

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-card';
    
    let mediaContent = '';
    if (post.image_url) {
        mediaContent = `<div class="post-media"><img src="${post.image_url}" alt="Publicació de ${post.username}" loading="lazy"></div>`;
    } else if (post.video_url) {
        mediaContent = `<div class="post-media"><video controls src="${post.video_url}"></video></div>`;
    }
    
    const isLiked = post.user_has_liked || false;
    const isOwnPost = post.user_id === currentUser.userId;
    
    postDiv.innerHTML = `
        <div class="post-header">
            <div class="user-avatar-small">
                ${post.avatar_url ? 
                    `<img src="${post.avatar_url}" alt="${post.username}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` :
                    post.username ? post.username.charAt(0).toUpperCase() : '🧗'
                }
            </div>
            <div class="post-header-info">
                <div class="post-user">${post.username || 'Muntanyer'}</div>
                <div class="post-time">${formatDate(post.timestamp)}</div>
            </div>
            ${isOwnPost ? `
                <div class="post-actions-menu">
                    <button class="btn-post-menu" onclick="togglePostMenu(${post.id})">⋯</button>
                    <div class="post-menu" id="post-menu-${post.id}">
                        <button class="menu-item" onclick="deletePost(${post.id})">🗑️ Eliminar</button>
                    </div>
                </div>
            ` : ''}
        </div>
        <div class="post-content">
            ${post.content ? `<div class="post-text">${post.content}</div>` : ''}
            ${mediaContent}
        </div>
        <div class="post-actions-bar">
            <div class="post-stats">
                <span>${post.likes_count || 0} likes</span>
                <span>💬 ${post.comments_count || 0} comentaris</span>
            </div>
            <div class="post-action-buttons">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id}, this)">
                    ${isLiked ? '❤️' : '🤍'} M'agrada
                </button>
                <button class="post-action" onclick="toggleComments(${post.id}, this)">
                    💬 Comentar
                </button>
                <button class="post-action" onclick="sharePost(${post.id})">
                    ↗️ Compartir
                </button>
            </div>
        </div>
        <div class="comments-section" id="comments-${post.id}" style="display: none;">
            <div class="comment-form">
                <input type="text" class="comment-input" id="comment-input-${post.id}" placeholder="Afegeix un comentari...">
                <button class="btn btn-primary btn-small" onclick="addComment(${post.id})">Publicar</button>
            </div>
            <div class="comment-list" id="comment-list-${post.id}">
                <div class="loading">Carregant comentaris...</div>
            </div>
        </div>
    `;
    
    return postDiv;
}

// Funció per mostrar/amagar menú de post
function togglePostMenu(postId) {
    const menu = document.getElementById(`post-menu-${postId}`);
    const allMenus = document.querySelectorAll('.post-menu');
    
    // Amagar tots els menús excepte el actual
    allMenus.forEach(m => {
        if (m.id !== `post-menu-${postId}`) {
            m.style.display = 'none';
        }
    });
    
    // Toggle del menú actual
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

// Tanca menús en fer clic a qualsevol lloc
document.addEventListener('click', function(e) {
    if (!e.target.closest('.post-actions-menu')) {
        document.querySelectorAll('.post-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

async function loadProfile() {
    try {
        const userResponse = await fetch('/api/user/profile');
        if (!userResponse.ok) throw new Error('Error carregant perfil');
        const user = await userResponse.json();
        
        updateProfileInfo(user);
        
        // Actualitza l'avatar del perfil
        if (user.avatar_url) {
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) {
                const existingImg = profileAvatar.querySelector('img');
                if (existingImg) {
                    existingImg.src = user.avatar_url;
                } else {
                    const img = document.createElement('img');
                    img.src = user.avatar_url;
                    img.alt = 'Avatar';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.borderRadius = '50%';
                    img.style.objectFit = 'cover';
                    profileAvatar.innerHTML = '';
                    profileAvatar.appendChild(img);
                }
            }
        }
        
        const postsResponse = await fetch(`/api/user/${user.id}/posts`);
        if (!postsResponse.ok) throw new Error('Error carregant posts');
        const posts = await postsResponse.json();
        
        displayProfilePosts(posts);
        
    } catch (error) {
        console.error('Error carregant perfil:', error);
        const profilePosts = document.getElementById('profilePosts');
        if (profilePosts) {
            profilePosts.innerHTML = '<div class="no-posts">Error carregant el perfil</div>';
        }
    }
}

function updateProfileInfo(user) {
    const usernameElem = document.getElementById('profileUsername');
    const bioElem = document.getElementById('profileBio');
    const joinDateElem = document.getElementById('joinDate');
    const postCountElem = document.getElementById('postCount');
    const avatarElem = document.getElementById('profileAvatar');
    
    if (usernameElem) usernameElem.textContent = user.username || 'Muntanyer';
    if (bioElem) bioElem.textContent = user.bio || 'Aventurer de muntanya';
    if (joinDateElem) joinDateElem.textContent = new Date(user.created_at).getFullYear();
    if (postCountElem) postCountElem.textContent = user.post_count || 0;
    if (avatarElem && user.username) {
        avatarElem.textContent = user.username.charAt(0).toUpperCase() + '🧗';
    }
}

function displayProfilePosts(posts) {
    const profilePosts = document.getElementById('profilePosts');
    if (!profilePosts) return;

    profilePosts.innerHTML = '';

    if (posts.length === 0) {
        profilePosts.innerHTML = `
            <div class="no-posts">
                <h3>Encara no has compartit cap aventura</h3>
                <p>Publica la teva primera experiència a la muntanya!</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postElement = createProfilePostElement(post);
        profilePosts.appendChild(postElement);
    });
}

function createProfilePostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'profile-post-card';
    
    let mediaContent = '';
    if (post.image_url) {
        mediaContent = `<img src="${post.image_url}" alt="Publicació">`;
    } else if (post.video_url) {
        mediaContent = `<video src="${post.video_url}"></video>`;
    } else {
        mediaContent = '<div class="profile-post-media">📝</div>';
    }
    
    postDiv.innerHTML = `
        <div class="profile-post-media">
            ${mediaContent}
        </div>
        <div class="profile-post-content">
            <div class="profile-post-text">${post.content || 'Sense descripció'}</div>
            <div class="profile-post-time">${formatDate(post.timestamp)}</div>
        </div>
    `;
    
    return postDiv;
}

function setupHomePage() {
    // No cal fer res extra per ara
}

// ===== UTILITATS =====
function formatDate(dateString) {
    if (!dateString) return 'Ara mateix';
    
    console.log('Data original:', dateString); // Debug
    
    // Intentar parsejar la data
    let date = new Date(dateString);
    
    // Si falla el parsing, tornar "Data desconeguda"
    if (isNaN(date.getTime())) {
        return 'Data desconeguda';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 60000); // Minuts
    const diffHours = Math.round(diffMs / 3600000); // Hores
    
    console.log('Diferència en minuts:', diffMins); // Debug
    
    // Si la diferència és negativa (problema de zona horària), ajustar
    if (diffMins < 0) {
        return 'Ara mateix';
    }
    
    if (diffMins < 1) return 'Ara mateix';
    if (diffMins < 60) return `Fa ${diffMins} min`;
    if (diffHours < 24) return `Fa ${diffHours} h`;
    if (diffHours < 168) return `Fa ${Math.round(diffHours / 24)} d`;
    
    // Més d'una setmana - mostrar data completa
    return date.toLocaleDateString('ca-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Afegir estils d'animació
if (!document.querySelector('style[data-notifications]')) {
    const style = document.createElement('style');
    style.setAttribute('data-notifications', 'true');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Fer funcions globals per als botons HTML
window.followUser = followUser;
window.toggleLike = toggleLike;
window.handleFollowRequest = handleFollowRequest;

// ===== COMENTARIS =====
async function toggleComments(postId, button) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    const commentList = document.getElementById(`comment-list-${postId}`);
    
    if (commentsSection.style.display === 'none') {
        // Mostrar comentaris
        commentsSection.style.display = 'block';
        await loadComments(postId, commentList);
    } else {
        // Amagar comentaris
        commentsSection.style.display = 'none';
    }
}

async function loadComments(postId, commentList) {
    try {
        console.log('Carregant comentaris per post:', postId); // Debug
        
        const response = await fetch(`/api/posts/${postId}/comments`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error HTTP:', response.status, errorText);
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        const comments = await response.json();
        console.log('Comentaris rebuts:', comments); // Debug
        
        if (comments.length === 0) {
            commentList.innerHTML = '<div class="no-posts">Encara no hi ha comentaris</div>';
            return;
        }
        
        commentList.innerHTML = comments.map(comment => `
            <div class="comment-item">
                <div class="comment-header">
                    <strong class="comment-username">${comment.username || 'Usuari'}</strong>
                    <span class="comment-time">${formatDate(comment.created_at)}</span>
                    ${comment.user_id === currentUser?.userId ? 
                        `<button class="btn-delete-comment" onclick="deleteComment(${comment.id}, ${postId})" title="Eliminar comentari">🗑️</button>` 
                        : ''}
                </div>
                <div class="comment-content">${comment.content || 'Sense contingut'}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error detallat carregant comentaris:', error);
        commentList.innerHTML = '<div class="no-posts">Error carregant comentaris: ' + error.message + '</div>';
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const content = commentInput.value.trim();
    
    if (!content) {
        showNotification('Escriu un comentari', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Comentari afegit!', 'success');
            commentInput.value = '';
            
            // Recarregar comentaris
            const commentList = document.getElementById(`comment-list-${postId}`);
            await loadComments(postId, commentList);
        } else {
            showNotification('Error afegint comentari: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

// ===== COMPARTIR =====
async function sharePost(postId) {
    // En una app real, això obriria el diàleg de compartir del dispositiu
    // Per ara, fem una simulació amb l'API de Web Share si està disponible
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Mira aquesta aventura a muntanyers!',
                text: 'Descobreix aquesta publicació interessant sobre muntanya',
                url: `${window.location.origin}/post/${postId}`
            });
            showNotification('Publicació compartida!', 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                copyPostLink(postId);
            }
        }
    } else {
        copyPostLink(postId);
    }
}

function copyPostLink(postId) {
    const tempInput = document.createElement('input');
    tempInput.value = `${window.location.origin}/post/${postId}`;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showNotification('Enllaç copiat al porta-retalls!', 'success');
}

// ===== LIKES MILLORATS =====
async function toggleLike(postId, button) {
    if (!currentUser) {
        showNotification('Has d\'iniciar sessió per donar like', 'error');
        return;
    }
    
    const isLiked = button.classList.contains('liked');
    const postStats = button.closest('.post-actions-bar').querySelector('.post-stats');
    const likesCountElem = postStats.querySelector('span');
    
    try {
        const url = `/api/posts/${postId}/like`;
        const method = isLiked ? 'DELETE' : 'POST';
        
        const response = await fetch(url, { method });
        const result = await response.json();
        
        if (result.success) {
            // Actualitzar comptador de likes
            let currentLikes = parseInt(likesCountElem.textContent) || 0;
            if (isLiked) {
                button.classList.remove('liked');
                button.innerHTML = '🤍 M\'agrada';
                currentLikes = Math.max(0, currentLikes - 1);
            } else {
                button.classList.add('liked');
                button.innerHTML = '❤️ M\'agrada';
                currentLikes += 1;
            }
            
            likesCountElem.textContent = `${currentLikes} likes`;
            
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}
// ===== AVATAR REAL =====
function setupAvatarUpload() {
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const avatarUpload = document.getElementById('avatarUpload');
    const avatarForm = document.getElementById('avatarForm');
    
    if (changeAvatarBtn && avatarUpload) {
        changeAvatarBtn.addEventListener('click', () => avatarUpload.click());
        
        avatarUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                showNotification('Selecciona una imatge vàlida', 'error');
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('avatar', file);
                
                const response = await fetch('/api/user/avatar', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Avatar actualitzat correctament!', 'success');
                    updateAvatarDisplay(result.avatarUrl);
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error de connexió', 'error');
            }
        });
    }
}

function updateAvatarDisplay(avatarUrl) {
    const avatarImg = document.getElementById('currentAvatarImg');
    const avatarFallback = document.getElementById('currentAvatarFallback');
    
    if (avatarUrl) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = 'block';
        avatarFallback.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarFallback.style.display = 'flex';
    }
}

// Carregar avatar actual
async function loadCurrentAvatar() {
    try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
            const user = await response.json();
            if (user.avatar_url) {
                updateAvatarDisplay(user.avatar_url);
            }
        }
    } catch (error) {
        console.error('Error carregant avatar:', error);
    }
}

// ===== ELIMINAR COMENTARIS =====
async function deleteComment(commentId, postId) {
    if (!confirm('Estàs segur que vols eliminar aquest comentari?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Comentari eliminat', 'success');
            // Recarregar comentaris
            const commentList = document.getElementById(`comment-list-${postId}`);
            await loadComments(postId, commentList);
        } else {
            showNotification('Error eliminant comentari: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}

// ===== ELIMINAR POSTS =====
async function deletePost(postId) {
    if (!confirm('Estàs segur que vols eliminar aquesta publicació?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Publicació eliminada', 'success');
            // Recarregar feed o perfil
            if (window.location.pathname === '/feed') {
                loadFeed();
            } else if (window.location.pathname === '/profile') {
                loadProfile();
            }
        } else {
            showNotification('Error eliminant publicació: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}
// ===== ACTUALITZAR AVATAR A TOT ARREU =====
function updateAllAvatars(avatarUrl) {
    // Actualitza tots els avatars de la pàgina
    const avatarElements = document.querySelectorAll('.user-avatar-small, .profile-avatar, .user-avatar');
    
    avatarElements.forEach(avatar => {
        if (avatarUrl) {
            // Si és un contenidor d'avatar, canvia a img
            if (avatar.classList.contains('user-avatar-small') || 
                avatar.classList.contains('profile-avatar') ||
                avatar.classList.contains('user-avatar')) {
                
                // Busca si ja té una imatge dins
                const existingImg = avatar.querySelector('img');
                if (existingImg) {
                    existingImg.src = avatarUrl;
                } else {
                    // Crea una nova imatge
                    const img = document.createElement('img');
                    img.src = avatarUrl;
                    img.alt = 'Avatar';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.borderRadius = '50%';
                    img.style.objectFit = 'cover';
                    
                    // Amaga el contingut original
                    avatar.innerHTML = '';
                    avatar.appendChild(img);
                }
            }
        }
    });
    
    // Actualitza també els avatars dels posts del feed
    updateFeedAvatars(avatarUrl);
}

function updateFeedAvatars(avatarUrl) {
    const currentUserAvatars = document.querySelectorAll('.post-header .user-avatar-small');
    currentUserAvatars.forEach(avatar => {
        const usernameElem = avatar.closest('.post-header').querySelector('.post-user');
        if (usernameElem && usernameElem.textContent === currentUser.username) {
            if (avatarUrl) {
                const existingImg = avatar.querySelector('img');
                if (existingImg) {
                    existingImg.src = avatarUrl;
                } else {
                    const img = document.createElement('img');
                    img.src = avatarUrl;
                    img.alt = 'Avatar';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.borderRadius = '50%';
                    img.style.objectFit = 'cover';
                    avatar.innerHTML = '';
                    avatar.appendChild(img);
                }
            }
        }
    });
}

// Modifica la funció handleAvatarUpload per cridar updateAllAvatars:
async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('Selecciona una imatge vàlida', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('avatar', file);
        
        const response = await fetch('/api/user/avatar', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Avatar actualitzat correctament!', 'success');
            updateAvatarDisplay(result.avatarUrl);
            updateAllAvatars(result.avatarUrl); // ← AFEGEIX AQUESTA LINIA
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error de connexió', 'error');
    }
}