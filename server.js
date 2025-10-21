const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

// ✅ CONFIGURACIÓ VERCEL - PostgreSQL
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Inicialitzar taules
async function initializeDatabase() {
  try {
    // Taula d'usuaris
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        bio TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        private BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Taula de posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        image_url TEXT,
        video_url TEXT,
        type VARCHAR(20) DEFAULT 'text',
        likes_count INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Taula de comentaris
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Taula de seguidors
    await pool.query(`
      CREATE TABLE IF NOT EXISTS followers (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);
    
    // Taula de likes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
      )
    `);
    
    // Taula de notificacions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50),
        post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Base de dades PostgreSQL inicialitzada');
  } catch (error) {
    console.error('❌ Error inicialitzant base de dades:', error);
  }
}

initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'clau-secreta-muntanyers-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware per verificar sessió
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticat' });
  }
  next();
};

// ✅ RUTA DE PROVA PER VERCEL
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      message: 'muntanyers funcionant a Vercel!',
      database: 'PostgreSQL connectat',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({ error: 'Error de base de dades' });
  }
});

// RUTES DE PÀGINES
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
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, hashedPassword]
    );
    
    req.session.userId = result.rows[0].id;
    req.session.username = result.rows[0].username;
    res.json({ success: true, userId: result.rows[0].id, username: result.rows[0].username });
  } catch (error) {
    console.error('Error en registre:', error);
    if (error.code === '23505') { // Violació de constraint únic
      if (error.constraint.includes('username')) {
        return res.status(400).json({ error: 'Aquest nom d\'usuari ja està en ús' });
      } else if (error.constraint.includes('email')) {
        return res.status(400).json({ error: 'Aquest email ja està registrat' });
      }
    }
    res.status(400).json({ error: error.message });
  }
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya incorrecta' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API: Obtenir perfil d'usuari
app.get('/api/users/:username', requireAuth, async (req, res) => {
  const username = req.params.username;
  
  try {
    const query = `
      SELECT id, username, bio, avatar_url, private, created_at,
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count,
      (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count,
      (SELECT COUNT(*) FROM followers WHERE follower_id = users.id AND status = 'accepted') as following_count,
      EXISTS(SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = users.id AND status = 'accepted') as is_following,
      EXISTS(SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = users.id AND status = 'pending') as has_pending_request
      FROM users WHERE username = $2
    `;
    
    const result = await pool.query(query, [req.session.userId, username]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuari no trobat' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obtenint perfil:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Actualitzar perfil
app.put('/api/user/profile', requireAuth, async (req, res) => {
  const { username, bio, private } = req.body;
  
  try {
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'El nom d\'usuari és obligatori' });
    }
    
    const result = await pool.query(
      'UPDATE users SET username = $1, bio = $2, private = $3 WHERE id = $4 RETURNING username',
      [username.trim(), bio ? bio.trim() : '', private ? true : false, req.session.userId]
    );
    
    req.session.username = result.rows[0].username;
    res.json({ success: true });
  } catch (error) {
    console.error('Error actualitzant perfil:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Aquest nom d\'usuari ja està en ús' });
    }
    res.status(400).json({ error: error.message });
  }
});

// API: Canviar contrasenya
app.put('/api/user/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.userId]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya actual incorrecta' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.session.userId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error canviant contrasenya:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Eliminar compte
app.delete('/api/user', requireAuth, async (req, res) => {
  const { password } = req.body;
  
  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.userId]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuari no trobat' });
    }
    
    const validPassword = await bcrypt.compare(password, result.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contrasenya incorrecta' });
    }
    
    // PostgreSQL eliminarà automàticament les files relacionades per ON DELETE CASCADE
    await pool.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
    
    req.session.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminant compte:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Crear post
app.post('/api/posts', requireAuth, async (req, res) => {
  const { content, image_url, video_url, type = 'text' } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, content, image_url, video_url, type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.session.userId, content, image_url, video_url, type]
    );
    
    res.json({ success: true, postId: result.rows[0].id });
  } catch (error) {
    console.error('Error creant post:', error);
    res.status(400).json({ error: error.message });
  }
});

// API: Obtenir posts del feed
app.get('/api/feed', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.username, u.avatar_url,
      EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = $1) as user_has_liked,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = p.id) as comments_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.timestamp DESC 
      LIMIT 50
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint feed:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Obtenir posts d'un usuari
app.get('/api/user/:userId/posts', requireAuth, async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const query = `
      SELECT p.*, u.username, u.avatar_url 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.user_id = $1 
      ORDER BY p.timestamp DESC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint posts usuari:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Obtenir informació de l'usuari
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT id, username, email, bio, avatar_url, private, created_at,
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count,
      (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count,
      (SELECT COUNT(*) FROM followers WHERE follower_id = users.id AND status = 'accepted') as following_count
      FROM users WHERE id = $1
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obtenint perfil:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Seguir usuari
app.post('/api/users/:userId/follow', requireAuth, async (req, res) => {
  const targetUserId = req.params.userId;
  
  try {
    // Comprovar si l'usuari target existeix i si és privat
    const userResult = await pool.query('SELECT private FROM users WHERE id = $1', [targetUserId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuari no trobat' });
    }
    
    const isPrivate = userResult.rows[0].private;
    const status = isPrivate ? 'pending' : 'accepted';
    
    await pool.query(
      'INSERT INTO followers (follower_id, following_id, status) VALUES ($1, $2, $3) ON CONFLICT (follower_id, following_id) DO UPDATE SET status = $3',
      [req.session.userId, targetUserId, status]
    );
    
    // Crear notificació si és compte privat
    if (isPrivate) {
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, type) VALUES ($1, $2, $3)',
        [targetUserId, req.session.userId, 'follow_request']
      );
    }
    
    res.json({ success: true, status: status });
  } catch (error) {
    console.error('Error seguint usuari:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Deixar de seguir usuari
app.delete('/api/users/:userId/follow', requireAuth, async (req, res) => {
  const targetUserId = req.params.userId;
  
  try {
    await pool.query(
      'DELETE FROM followers WHERE follower_id = $1 AND following_id = $2',
      [req.session.userId, targetUserId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deixant de seguir:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Gestionar sol·licitud de seguiment
app.post('/api/followers/:followerId/:action', requireAuth, async (req, res) => {
  const followerId = req.params.followerId;
  const action = req.params.action; // 'accept' o 'reject'
  
  try {
    const status = action === 'accept' ? 'accepted' : 'rejected';
    
    await pool.query(
      'UPDATE followers SET status = $1 WHERE follower_id = $2 AND following_id = $3',
      [status, followerId, req.session.userId]
    );
    
    // Crear notificació d'acceptació
    if (action === 'accept') {
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, type) VALUES ($1, $2, $3)',
        [followerId, req.session.userId, 'follow_accepted']
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error gestionant seguiment:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Donar like
app.post('/api/posts/:postId/like', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  
  try {
    await pool.query(
      'INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT (user_id, post_id) DO NOTHING',
      [req.session.userId, postId]
    );
    
    // Actualizar contador de likes
    await pool.query(
      'UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = $1) WHERE id = $1',
      [postId]
    );
    
    // Crear notificació
    const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length > 0 && postResult.rows[0].user_id !== req.session.userId) {
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES ($1, $2, $3, $4)',
        [postResult.rows[0].user_id, req.session.userId, 'like', postId]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error donant like:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Treure like
app.delete('/api/posts/:postId/like', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  
  try {
    await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
      [req.session.userId, postId]
    );
    
    // Actualizar contador de likes
    await pool.query(
      'UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = $1) WHERE id = $1',
      [postId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error treient like:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Comentar
app.post('/api/posts/:postId/comments', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  const { content } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING id',
      [req.session.userId, postId, content]
    );
    
    // Crear notificació
    const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length > 0 && postResult.rows[0].user_id !== req.session.userId) {
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES ($1, $2, $3, $4)',
        [postResult.rows[0].user_id, req.session.userId, 'comment', postId]
      );
    }
    
    res.json({ success: true, commentId: result.rows[0].id });
  } catch (error) {
    console.error('Error comentant:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Obtenir comentaris
app.get('/api/posts/:postId/comments', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  
  try {
    const query = `
      SELECT c.*, u.username, u.id as user_id
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = $1 
      ORDER BY c.created_at ASC
    `;
    
    const result = await pool.query(query, [postId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint comentaris:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Eliminar comentari
app.delete('/api/comments/:commentId', requireAuth, async (req, res) => {
  const commentId = req.params.commentId;
  
  try {
    // Verificar que el comentari pertany a l'usuari
    const commentResult = await pool.query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
    
    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comentari no trobat' });
    }
    
    if (commentResult.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tens permís per eliminar aquest comentari' });
    }
    
    await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminant comentari:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Eliminar post
app.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  
  try {
    // Verificar que el post pertany a l'usuari
    const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Publicació no trobada' });
    }
    
    if (postResult.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tens permís per eliminar aquesta publicació' });
    }
    
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminant post:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Obtenir notificacions
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT n.*, u.username as from_username, p.content as post_content
      FROM notifications n
      JOIN users u ON n.from_user_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint notificacions:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Marcar notificacions com a llegides
app.put('/api/notifications/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [req.session.userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marcant notificacions:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// API: Cercar usuaris
app.get('/api/users/search/:query', requireAuth, async (req, res) => {
  const query = req.params.query;
  
  try {
    const sql = `
      SELECT id, username, avatar_url, bio,
      (SELECT COUNT(*) FROM followers WHERE following_id = users.id AND status = 'accepted') as follower_count
      FROM users 
      WHERE username ILIKE $1 AND id != $2
      LIMIT 20
    `;
    
    const result = await pool.query(sql, [`%${query}%`, req.session.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error cercant usuaris:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// ===== RUTES D'AVATAR (AFEGIR A server.js) =====

// API: Pujar avatar
app.post('/api/user/avatar', requireAuth, async (req, res) => {
  try {
    // En una implementació real, aquí pujaries la imatge a un servei d'emmagatzematge
    // Per ara, simulem l'actualització amb una URL fictícia
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(req.session.username)}&background=1a936f&color=fff&size=150`;
    
    await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, req.session.userId]
    );
    
    res.json({ 
      success: true, 
      avatarUrl: avatarUrl 
    });
  } catch (error) {
    console.error('Error actualitzant avatar:', error);
    res.status(500).json({ error: 'Error actualitzant avatar' });
  }
});

// API: Obtenir avatar
app.get('/api/user/avatar', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length > 0) {
      res.json({ avatarUrl: result.rows[0].avatar_url });
    } else {
      res.json({ avatarUrl: null });
    }
  } catch (error) {
    console.error('Error obtenint avatar:', error);
    res.status(500).json({ error: 'Error obtenint avatar' });
  }
});

// ===== CORRECCIÓ DE PROBLEMES DE DATES =====

// API: Obtenir posts del feed (versió corregida)
app.get('/api/feed', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.username, u.avatar_url,
      EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = $1) as user_has_liked,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = p.id) as comments_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.timestamp DESC 
      LIMIT 50
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    
    // Convertir les dates a format compatible
    const posts = result.rows.map(post => ({
      ...post,
      timestamp: post.timestamp ? new Date(post.timestamp).toISOString() : new Date().toISOString()
    }));
    
    res.json(posts);
  } catch (error) {
    console.error('Error obtenint feed:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Obtenir comentaris (versió corregida)
app.get('/api/posts/:postId/comments', requireAuth, async (req, res) => {
  const postId = req.params.postId;
  
  try {
    const query = `
      SELECT c.*, u.username, u.id as user_id
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = $1 
      ORDER BY c.created_at ASC
    `;
    
    const result = await pool.query(query, [postId]);
    
    // Convertir les dates
    const comments = result.rows.map(comment => ({
      ...comment,
      created_at: comment.created_at ? new Date(comment.created_at).toISOString() : new Date().toISOString()
    }));
    
    res.json(comments);
  } catch (error) {
    console.error('Error obtenint comentaris:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// ===== RUTES ADICIONALS PER AL PERFIL =====

// API: Obtenir seguidors
app.get('/api/user/followers', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.avatar_url, u.bio
      FROM followers f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $1 AND f.status = 'accepted'
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint seguidors:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// API: Obtenir seguint
app.get('/api/user/following', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.avatar_url, u.bio
      FROM followers f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $1 AND f.status = 'accepted'
    `;
    
    const result = await pool.query(query, [req.session.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obtenint seguint:', error);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
});

// ===== MILLORA DEL FORMAT DE DATES =====

// Funció auxiliar per formatar dates consistentment
function formatDateForClient(dateString) {
  if (!dateString) return new Date().toISOString();
  
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

// ✅ MANEJADOR D'ERRORS GLOBAL
app.use((err, req, res, next) => {
  console.error('❌ Error del servidor:', err);
  res.status(500).json({ 
    error: 'Error intern del servidor',
    message: err.message 
  });
});

// ✅ INICIAR SERVIDOR (solo para desarrollo)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🏔️ muntanyers funcionant a http://localhost:${PORT}`);
  });
}

module.exports = app;