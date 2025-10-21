const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ✅ CONFIGURACIÓ VERCEL
const PORT = process.env.PORT || 3000;

const app = express();
// Força SQLite a utilitzar data/hora en format local
const db = new sqlite3.Database('muntanyers.db', (err) => {
    if (err) {
        console.error('Error obrint base de dades:', err);
    } else {
        // Configura SQLite per dates locals
        db.run("PRAGMA foreign_keys = ON");
        db.run("PRAGMA encoding = 'UTF-8'");
    }
});

// Configuració de Multer per a pujar arxius
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Nom únic: userid-timestamp.extensio
    const uniqueName = `avatar-${req.session.userId}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Només es permeten imatges'));
    }
  }
});

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: 'clau-secreta-muntanyers-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Crear carpetes per a uploads
if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

// Inicialitzar base de dades
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    private BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    image_url TEXT,
    video_url TEXT,
    type TEXT DEFAULT 'text',
    likes_count INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS followers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER,
    following_id INTEGER,
    status TEXT DEFAULT 'pending', -- 'accepted', 'pending', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    from_user_id INTEGER,
    type TEXT, -- 'follow_request', 'follow_accepted', 'like', 'comment'
    post_id INTEGER,
    read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware per verificar sessió
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticat' });
  }
  next();
};

// Rutes de pàgines (mantenir les existents)
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'public', 'feed.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/feed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feed.html'));
});

app.get('/settings', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/users', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

app.get('/notifications', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'notifications.html'));
});

// APIs existents (mantenir)...

// === NOVES APIs ===
// === NOVA API: Pujar avatar ===
app.post('/api/user/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Cap arxiu pujat' });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  
  // Eliminar avatar anterior si existeix
  db.get('SELECT avatar_url FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (!err && user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
      const oldAvatarPath = path.join(__dirname, 'public', user.avatar_url);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }
    
    // Actualitzar base de dades
    db.run(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [avatarUrl, req.session.userId],
      function(err) {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        res.json({ success: true, avatarUrl: avatarUrl });
      }
    );
  });
});

// API: Obtenir perfil d'usuari
app.get('/api/users/:username', requireAuth, (req, res) => {
  const username = req.params.username;
  
  const query = `
    SELECT id, username, bio, avatar_url, private, created_at,
    (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count,
    (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count,
    (SELECT COUNT(*) FROM followers WHERE follower_id = users.id AND status = 'accepted') as following_count,
    EXISTS(SELECT 1 FROM followers WHERE follower_id = ? AND following_id = users.id AND status = 'accepted') as is_following,
    EXISTS(SELECT 1 FROM followers WHERE follower_id = ? AND following_id = users.id AND status = 'pending') as has_pending_request
    FROM users WHERE username = ?
  `;
  
  db.get(query, [req.session.userId, req.session.userId, username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Usuari no trobat' });
    }
    res.json(user);
  });
});

// API: Actualitzar perfil - VERSIÓ CORREGIDA
app.put('/api/user/profile', requireAuth, (req, res) => {
  const { username, bio, private } = req.body;
  
  console.log('Dades rebudes per actualitzar perfil:', { username, bio, private }); // Debug
  
  // Validacions bàsiques
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'El nom d\'usuari és obligatori' });
  }
  
  db.run(
    'UPDATE users SET username = ?, bio = ?, private = ? WHERE id = ?',
    [username.trim(), bio ? bio.trim() : '', private ? 1 : 0, req.session.userId],
    function(err) {
      if (err) {
        console.error('Error actualitzant perfil:', err);
        // Si és error de usuari duplicat
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Aquest nom d\'usuari ja està en ús' });
        }
        return res.status(400).json({ error: err.message });
      }
      
      // Actualitzar sessió
      req.session.username = username;
      
      console.log('Perfil actualitzat correctament'); // Debug
      res.json({ success: true });
    }
  );
});

// API: Canviar contrasenya
app.put('/api/user/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Verificar contrasenya actual
  db.get('SELECT password FROM users WHERE id = ?', [req.session.userId], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya actual incorrecta' });
    }
    
    // Actualitzar contrasenya
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.run(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.session.userId],
      function(err) {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
  });
});

// API: Eliminar compte
app.delete('/api/user', requireAuth, async (req, res) => {
  const { password } = req.body;
  
  // Verificar contrasenya
  db.get('SELECT password FROM users WHERE id = ?', [req.session.userId], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya incorrecta' });
    }
    
    // Eliminar dades de l'usuari (en producció faries soft delete)
    db.serialize(() => {
      db.run('DELETE FROM posts WHERE user_id = ?', [req.session.userId]);
      db.run('DELETE FROM followers WHERE follower_id = ? OR following_id = ?', [req.session.userId, req.session.userId]);
      db.run('DELETE FROM likes WHERE user_id = ?', [req.session.userId]);
      db.run('DELETE FROM comments WHERE user_id = ?', [req.session.userId]);
      db.run('DELETE FROM users WHERE id = ?', [req.session.userId]);
    });
    
    req.session.destroy();
    res.json({ success: true });
  });
});

// API: Seguir usuari
app.post('/api/users/:userId/follow', requireAuth, (req, res) => {
  const targetUserId = req.params.userId;
  
  // Comprovar si l'usuari target existeix i si és privat
  db.get('SELECT private FROM users WHERE id = ?', [targetUserId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Usuari no trobat' });
    }
    
    const status = user.private ? 'pending' : 'accepted';
    
    db.run(
      'INSERT OR REPLACE INTO followers (follower_id, following_id, status) VALUES (?, ?, ?)',
      [req.session.userId, targetUserId, status],
      function(err) {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        
        // Crear notificació si és compte privat
        if (user.private) {
          db.run(
            'INSERT INTO notifications (user_id, from_user_id, type) VALUES (?, ?, ?)',
            [targetUserId, req.session.userId, 'follow_request']
          );
        }
        
        res.json({ success: true, status: status });
      }
    );
  });
});

// API: Gestionar sol·licitud de seguiment
app.post('/api/followers/:followerId/:action', requireAuth, (req, res) => {
  const followerId = req.params.followerId;
  const action = req.params.action; // 'accept' o 'reject'
  
  const status = action === 'accept' ? 'accepted' : 'rejected';
  
  db.run(
    'UPDATE followers SET status = ? WHERE follower_id = ? AND following_id = ?',
    [status, followerId, req.session.userId],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Crear notificació d'acceptació
      if (action === 'accept') {
        db.run(
          'INSERT INTO notifications (user_id, from_user_id, type) VALUES (?, ?, ?)',
          [followerId, req.session.userId, 'follow_accepted']
        );
      }
      
      res.json({ success: true });
    }
  );
});

// API: Donar like
app.post('/api/posts/:postId/like', requireAuth, (req, res) => {
  const postId = req.params.postId;
  
  db.run(
    'INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)',
    [req.session.userId, postId],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Actualizar contador de likes
      db.run(
        'UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?',
        [postId]
      );
      
      // Crear notificació
      db.get('SELECT user_id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (!err && post && post.user_id !== req.session.userId) {
          db.run(
            'INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES (?, ?, ?, ?)',
            [post.user_id, req.session.userId, 'like', postId]
          );
        }
      });
      
      res.json({ success: true });
    }
  );
});

// API: Treure like
app.delete('/api/posts/:postId/like', requireAuth, (req, res) => {
  const postId = req.params.postId;
  
  db.run(
    'DELETE FROM likes WHERE user_id = ? AND post_id = ?',
    [req.session.userId, postId],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Actualizar contador de likes
      db.run(
        'UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?',
        [postId]
      );
      
      res.json({ success: true });
    }
  );
});

// API: Comentar
app.post('/api/posts/:postId/comments', requireAuth, (req, res) => {
  const postId = req.params.postId;
  const { content } = req.body;
  
  db.run(
    'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)',
    [req.session.userId, postId, content],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Crear notificació
      db.get('SELECT user_id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (!err && post && post.user_id !== req.session.userId) {
          db.run(
            'INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES (?, ?, ?, ?)',
            [post.user_id, req.session.userId, 'comment', postId]
          );
        }
      });
      
      res.json({ success: true, commentId: this.lastID });
    }
  );
});

// API: Obtenir comentaris - VERSIÓ CORREGIDA
app.get('/api/posts/:postId/comments', requireAuth, (req, res) => {
  const postId = req.params.postId;
  
  console.log('Obtenint comentaris per post:', postId); // Debug
  
  const query = `
    SELECT c.*, u.username, u.id as user_id
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    WHERE c.post_id = ? 
    ORDER BY c.created_at ASC
  `;
  
  db.all(query, [postId], (err, comments) => {
    if (err) {
      console.error('Error obtenint comentaris:', err);
      return res.status(500).json({ error: 'Error intern del servidor' });
    }
    
    console.log(`Comentaris trobats: ${comments.length} per post ${postId}`); // Debug
    res.json(comments);
  });
});

// API: Comentar - amb data manual
app.post('/api/posts/:postId/comments', requireAuth, (req, res) => {
  const postId = req.params.postId;
  const { content } = req.body;
  
  // Data actual en format compatible
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  
  console.log('Creant comentari amb data:', now); // Debug
  
  db.run(
    'INSERT INTO comments (user_id, post_id, content, created_at) VALUES (?, ?, ?, ?)',
    [req.session.userId, postId, content, now],
    function(err) {
      if (err) {
        console.error('Error creant comentari:', err);
        return res.status(400).json({ error: err.message });
      }
      
      // Crear notificació
      db.get('SELECT user_id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (!err && post && post.user_id !== req.session.userId) {
          db.run(
            'INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES (?, ?, ?, ?)',
            [post.user_id, req.session.userId, 'comment', postId]
          );
        }
      });
      
      res.json({ success: true, commentId: this.lastID });
    }
  );
});

// API: Obtenir notificacions
app.get('/api/notifications', requireAuth, (req, res) => {
  const query = `
    SELECT n.*, u.username as from_username, p.content as post_content
    FROM notifications n
    JOIN users u ON n.from_user_id = u.id
    LEFT JOIN posts p ON n.post_id = p.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `;
  
  db.all(query, [req.session.userId], (err, notifications) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(notifications);
  });
});

// API: Marcar notificacions com a llegides
app.put('/api/notifications/read', requireAuth, (req, res) => {
  db.run(
    'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
    [req.session.userId],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// API: Cercar usuaris
app.get('/api/users/search/:query', requireAuth, (req, res) => {
  const query = req.params.query;
  
  const sql = `
    SELECT id, username, avatar_url, bio,
    (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count
    FROM users 
    WHERE username LIKE ? AND id != ?
    LIMIT 20
  `;
  
  db.all(sql, [`%${query}%`, req.session.userId], (err, users) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(users);
  });
});

// === APIs EXISTENTS ===

// API: Verificar autenticació
app.get('/api/check-auth', (req, res) => {
  res.json({
    authenticated: !!req.session.userId,
    username: req.session.username,
    userId: req.session.userId
  });
});

// API: Registre
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        
        req.session.userId = this.lastID;
        req.session.username = username;
        res.json({ success: true, userId: this.lastID, username: username });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya incorrecta' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  });
});

// API: Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API: Crear post - amb data manual
app.post('/api/posts', requireAuth, (req, res) => {
  const { content, image_url, video_url, type = 'text' } = req.body;
  
  // Data actual en format compatible
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  
  console.log('Creant post amb data:', now); // Debug
  
  db.run(
    'INSERT INTO posts (user_id, content, image_url, video_url, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [req.session.userId, content, image_url, video_url, type, now],
    function(err) {
      if (err) {
        console.error('Error creant post:', err);
        return res.status(400).json({ error: err.message });
      }
      res.json({ success: true, postId: this.lastID });
    }
  );
});

// API: Obtenir posts del feed - assegura format correcte
app.get('/api/feed', requireAuth, (req, res) => {
  const query = `
    SELECT p.*, u.username, u.avatar_url,
    EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = ?) as user_has_liked,
    (SELECT COUNT(*) FROM likes WHERE likes.post_id = p.id) as likes_count,
    (SELECT COUNT(*) FROM comments WHERE comments.post_id = p.id) as comments_count
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    ORDER BY p.timestamp DESC 
    LIMIT 50
  `;
  
  db.all(query, [req.session.userId], (err, posts) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    // Debug: mostra les dates que s'envien
    posts.forEach(post => {
      console.log('Post ID:', post.id, 'Data:', post.timestamp);
    });
    
    res.json(posts);
  });
});

// API: Obtenir posts d'un usuari
app.get('/api/user/:userId/posts', requireAuth, (req, res) => {
  const userId = req.params.userId;
  
  const query = `
    SELECT p.*, u.username, u.avatar_url 
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    WHERE p.user_id = ? 
    ORDER BY p.timestamp DESC
  `;
  
  db.all(query, [userId], (err, posts) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(posts);
  });
});

// API: Obtenir informació de l'usuari
app.get('/api/user/profile', requireAuth, (req, res) => {
  const query = `
    SELECT id, username, email, bio, avatar_url, private, created_at,
    (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count,
    (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count,
    (SELECT COUNT(*) FROM followers WHERE follower_id = users.id AND status = 'accepted') as following_count
    FROM users WHERE id = ?
  `;
  
  db.get(query, [req.session.userId], (err, user) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(user);
  });
});

// API: Eliminar comentari
app.delete('/api/comments/:commentId', requireAuth, (req, res) => {
  const commentId = req.params.commentId;
  
  console.log('Intentant eliminar comentari:', commentId, 'Usuari:', req.session.userId); // Debug
  
  // Verificar que el comentari pertany a l'usuari
  db.get('SELECT user_id FROM comments WHERE id = ?', [commentId], (err, comment) => {
    if (err) {
      console.error('Error BD:', err);
      return res.status(500).json({ error: 'Error de base de dades' });
    }
    
    if (!comment) {
      return res.status(404).json({ error: 'Comentari no trobat' });
    }
    
    if (comment.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tens permís per eliminar aquest comentari' });
    }
    
    db.run('DELETE FROM comments WHERE id = ?', [commentId], function(err) {
      if (err) {
        console.error('Error eliminant comentari:', err);
        return res.status(500).json({ error: 'Error eliminant comentari' });
      }
      res.json({ success: true });
    });
  });
});

// API: Eliminar post
app.delete('/api/posts/:postId', requireAuth, (req, res) => {
  const postId = req.params.postId;
  
  console.log('Intentant eliminar post:', postId, 'Usuari:', req.session.userId); // Debug
  
  // Verificar que el post pertany a l'usuari
  db.get('SELECT user_id FROM posts WHERE id = ?', [postId], (err, post) => {
    if (err) {
      console.error('Error BD:', err);
      return res.status(500).json({ error: 'Error de base de dades' });
    }
    
    if (!post) {
      return res.status(404).json({ error: 'Publicació no trobada' });
    }
    
    if (post.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tens permís per eliminar aquesta publicació' });
    }
    
    // Eliminar post i tot el relacionat
    db.serialize(() => {
      db.run('DELETE FROM likes WHERE post_id = ?', [postId]);
      db.run('DELETE FROM comments WHERE post_id = ?', [postId]);
      db.run('DELETE FROM posts WHERE id = ?', [postId]);
    });
    
    res.json({ success: true });
  });
});

// ✅ FINAL VERCEL
app.listen(PORT, () => {
  console.log(`🏔️ muntanyers funcionant a http://localhost:${PORT}`);
});

module.exports = app;