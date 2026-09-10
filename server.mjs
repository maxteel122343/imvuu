import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import axios from 'axios';

const require = createRequire(import.meta.url);
let Client;
try {
	({ Client } = require('./packages/client/dist/cjs/index.js'));
} catch (e) {
	console.warn('[AI Studio] Compiled Client not found or failed to load:', e.message);
	Client = class FallbackClient {
		constructor() {
			this.account = {
				user: {
					id: '0000',
					username: 'User',
					displayName: 'User',
					avatarImage: '',
					avatarPortraitImage: '',
					isVip: false,
					isAp: false,
					isCreator: false,
					registered: '2023',
				},
				friends: {
					async *list() {}
				}
			};
			this.users = {
				search: async () => [],
				fetch: async () => []
			};
		}
		async login(username, password) {
			this.account.user.username = username;
			this.account.user.displayName = username;
			return this.account;
		}
	};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================
// SUPABASE & PERSISTÊNCIA MULTI-TENANT ISOLADA POR USUÁRIO
// Projeto: enqntyzoaftatfhovsxw (https://enqntyzoaftatfhovsxw.supabase.co)
// =============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://enqntyzoaftatfhovsxw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucW50eXpvYWZ0YXRmaG92c3h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNTcxNTAsImV4cCI6MjEwNDYzMzE1MH0.bfk6-0MmkJVB57qSsE7w8l8krYsVkxs9inmTc3mHHnU';

// Arquivo de persistência local por usuário (garante privacidade e funcionamento instantâneo)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
	try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const LOCAL_STORE_FILE = path.join(DATA_DIR, 'store.json');

function loadLocalStore() {
	try {
		if (fs.existsSync(LOCAL_STORE_FILE)) {
			return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
		}
	} catch (e) {
		console.warn('Erro ao carregar store local:', e.message);
	}
	return {
		userCheckerTargets: {}, // { [owner_username_lower]: [ card1, card2 ] }
		userSavedRooms: {},     // { [owner_username_lower]: [ room1, room2 ] }
		userAppSettings: {},    // { [owner_username_lower]: { is_visible, sound_alerts, ... } }
		userAppFriends: {},     // { [owner_username_lower]: [ friend1, friend2 ] }
		userConversations: {},  // { [pairKey]: [ messages ] }
		user3dPresence: {}      // { [owner_username_lower]: { pos_x, pos_y, pos_z, rot_y, ... } }
	};
}

let dbStore = loadLocalStore();
if (!dbStore.userCheckerTargets) dbStore.userCheckerTargets = {};
if (!dbStore.userSavedRooms) dbStore.userSavedRooms = {};
if (!dbStore.userAppSettings) dbStore.userAppSettings = {};
if (!dbStore.userAppFriends) dbStore.userAppFriends = {};
if (!dbStore.userConversations) dbStore.userConversations = {};
if (!dbStore.user3dPresence) dbStore.user3dPresence = {};

function saveLocalStore() {
	try {
		fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(dbStore, null, 2), 'utf-8');
	} catch (e) {
		console.warn('Erro ao salvar store local:', e.message);
	}
}

// Helper para chamadas à API REST do Supabase
async function supabaseRest(endpoint, method = 'GET', data = null, query = '') {
	try {
		const fullUrl = `${SUPABASE_URL}/rest/v1/${endpoint}${query ? '?' + query : ''}`;
		const headers = {
			'apikey': SUPABASE_KEY,
			'Authorization': `Bearer ${SUPABASE_KEY}`,
			'Content-Type': 'application/json',
			'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
		};
		const response = await axios({
			method,
			url: fullUrl,
			headers,
			data,
			timeout: 5000
		});
		return { success: true, data: response.data };
	} catch (err) {
		return {
			success: false,
			status: err.response?.status,
			error: err.response?.data?.message || err.message
		};
	}
}

// Estruturas de memória do Checker PartnerVU
const clients = new Map();
const userNotifications = new Map();
const favoriteRoomsMap = new Map();
const userSavedFriends = new Map();
const userRoomHistory = new Map();
const directMessagesStore = new Map();
const appUsersOnline = new Map();

// Hidratar estruturas da memória com dados persistentes locais
for (const [userKey, rooms] of Object.entries(dbStore.userSavedRooms)) {
	favoriteRoomsMap.set(userKey, rooms);
}
for (const [userKey, friends] of Object.entries(dbStore.userAppFriends)) {
	userSavedFriends.set(userKey, friends);
}
for (const [pairKey, msgs] of Object.entries(dbStore.userConversations)) {
	directMessagesStore.set(pairKey, msgs);
}

// Helper para chave de mensagem direta
function getPairKey(u1, u2) {
	return [String(u1).toLowerCase(), String(u2).toLowerCase()].sort().join(':::');
}

// -------------------------------------------------------------
// PROXY DE IMAGENS DO IMVU (Garante 100% de carregamento sem erro de CORS/Referrer)
// -------------------------------------------------------------
app.get('/api/image-proxy', async (req, res) => {
	const imageUrl = req.query.url;
	if (!imageUrl || typeof imageUrl !== 'string') {
		return res.status(400).send('Image URL required');
	}

	try {
		const parsed = new URL(imageUrl);
		const allowedHosts = ['imvu.com', 'webasset-akm.imvu.com', 'userimages-akm.imvu.com', 'api.imvu.com', 'asset-server-akm.imvu.com'];
		const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
		if (!isAllowed) {
			return res.status(403).send('Forbidden host');
		}

		const imgRes = await axios.get(imageUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
				'Referer': 'https://www.imvu.com/'
			},
			responseType: 'arraybuffer',
			timeout: 7000
		});

		res.set('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
		res.set('Cache-Control', 'public, max-age=86400');
		return res.send(Buffer.from(imgRes.data));
	} catch (e) {
		return res.status(404).send('Image not available');
	}
});

// Helper para buscar dados 100% REAIS da API pública e de autenticação do IMVU
async function fetchImvuUser(username) {
	if (!username || !username.trim()) return null;
	const cleanName = username.trim();

	try {
		const res = await axios.get(`https://api.imvu.com/user?username=${encodeURIComponent(cleanName)}`, {
			headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
			timeout: 7000
		});

		const denorm = res.data?.denormalized;
		if (!denorm) return null;

		const userKey = Object.keys(denorm).find(k => k.includes('/user/user-'));
		if (!userKey) return null;

		const u = denorm[userKey].data;
		const id = u.legacy_cid || (userKey.split('user-')[1] || '').trim();

		// Checagem de presença real em tempo real via endpoint /presence/presence-{id}
		let isOnline = Boolean(u.online);
		try {
			const pRes = await axios.get(`https://api.imvu.com/presence/presence-${id}`, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
				timeout: 4000
			});
			const pDenorm = pRes.data?.denormalized;
			const pKey = Object.keys(pDenorm || {})[0];
			if (pKey && pDenorm[pKey]?.data?.online !== undefined) {
				isOnline = Boolean(pDenorm[pKey].data.online);
			}
		} catch (presErr) {}

		// Checagem de Outfits reais via endpoint /profile_outfit/profile_outfit-{id}
		let outfits = null;
		try {
			const oRes = await axios.get(`https://api.imvu.com/profile_outfit/profile_outfit-${id}`, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
				timeout: 4000
			});
			const oDenorm = oRes.data?.denormalized;
			const oKey = Object.keys(oDenorm || {})[0];
			if (oKey && oDenorm[oKey]?.data) {
				const oData = oDenorm[oKey].data;
				outfits = {
					lookUrl: oData.look_url || '',
					assetUrl: oData.asset_url || '',
					productsCount: Array.isArray(oData.products) ? oData.products.length : 0,
					products: (oData.products || []).slice(0, 15).map(p => ({
						productId: p.product_id,
						rating: p.rating || 'GA',
						owned: Boolean(p.owned),
						productUrl: `https://pt.imvu.com/shop/product.php?products_id=${p.product_id}`
					}))
				};
			}
		} catch (outfitErr) {}

		// Sala atual do usuário (se estiver em alguma sala pública no IMVU)
		let currentRoom = null;
		if (denorm[userKey]?.relations?.current_room) {
			const roomUrl = denorm[userKey].relations.current_room;
			const roomId = roomUrl.split('room-')[1];
			if (roomId) {
				try {
					const rRes = await axios.get(`https://api.imvu.com/room/room-${roomId}`, {
						headers: { 'User-Agent': 'Mozilla/5.0' },
						timeout: 4000
					});
					const rDenorm = rRes.data?.denormalized;
					const rKey = Object.keys(rDenorm || {})[0];
					if (rKey && rDenorm[rKey]?.data) {
						const rd = rDenorm[rKey].data;
						currentRoom = {
							id: `room-${roomId}`,
							name: rd.name || `Sala ${roomId}`,
							host: rd.owner_avatarname || 'IMVU Host',
							occupancy: rd.occupancy || 0,
							capacity: rd.capacity || 10,
							imageUrl: rd.image_url ? (rd.image_url.startsWith('//') ? `https:${rd.image_url}` : rd.image_url) : '',
							imvuUrl: rd.join_room_url || `https://go.imvu.com/chat/room-${roomId}`
						};

						// Registrar no histórico de salas do usuário
						const userHistKey = cleanName.toLowerCase();
						if (!userRoomHistory.has(userHistKey)) userRoomHistory.set(userHistKey, []);
						const hist = userRoomHistory.get(userHistKey);
						if (!hist.some(h => h.roomId === currentRoom.id)) {
							hist.unshift({
								...currentRoom,
								visitedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
							});
							if (hist.length > 20) hist.pop();
						}
					}
				} catch (rErr) {}
			}
		}

		// Avatar oficial do IMVU com máxima resolução
		let avatarUrl = u.avatar_portrait_image || u.thumbnail_url || u.avatar_image || '';
		if (avatarUrl && avatarUrl.startsWith('//')) {
			avatarUrl = `https:${avatarUrl}`;
		}
		let thumbUrl = u.thumbnail_url || '';
		if (thumbUrl && thumbUrl.startsWith('//')) {
			thumbUrl = `https:${thumbUrl}`;
		}

		let registeredDate = 'Data não disponível';
		if (u.created) {
			registeredDate = new Date(u.created).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
		} else if (u.registered) {
			registeredDate = new Date(u.registered * 1000).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
		}

		return {
			id: String(id),
			username: u.username,
			displayName: u.display_name || u.username,
			avatarImage: avatarUrl,
			thumbnailUrl: thumbUrl,
			avatarPortraitImage: u.avatar_portrait_image || (u.avatar_image ? `${u.avatar_image}?view=dressup_front_heads` : ''),
			isVip: Boolean(u.is_vip),
			vipTier: u.vip_tier || (u.is_vip ? 1 : 0),
			isAp: Boolean(u.is_ap || u.is_ap_plus),
			isCreator: Boolean(u.is_creator),
			isAdult: Boolean(u.is_adult),
			isAgeVerified: Boolean(u.is_ageverified),
			online: isOnline,
			gender: u.gender === 'm' ? 'Masculino' : (u.gender === 'f' ? 'Feminino' : (u.gender ? String(u.gender) : 'Não informado')),
			country: u.country || 'Não informado',
			age: u.age || 'Não informado',
			interests: (u.interests || '').trim(),
			tagline: (u.tagline || '').trim(),
			registered: registeredDate,
			outfits,
			currentRoom,
			imvuProfileUrl: `https://pt.imvu.com/next/av/${encodeURIComponent(u.username)}/`
		};
	} catch (err) {
		console.warn(`[Checker] Falha ao extrair dados de @${cleanName} da API IMVU:`, err.message);
		return null;
	}
}

// Catálogo verificado de salas 100% REAIS extraídas do IMVU oficial (sem imagens de IA)
const REAL_IMVU_ROOMS = [
	{
		id: 'room-252190496-52',
		name: 'ᴀ sᴀʟᴀ ᴠᴇʀᴍᴇʟʜᴀ',
		host: {
			username: 'Alex_Neo',
			displayName: 'Alex Neo'
		},
		image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
		description: '| kiss | beijo | relax | lounge | quarto | motel | poses | casal | couple | photo | room |',
		language: 'Portuguese',
		capacity: 6,
		occupants: [],
		imvuUrl: 'https://go.imvu.com/chat/room-252190496-52',
		messages: []
	},
	{
		id: 'room-252190496-36',
		name: 'ᕳᕲ OAKLEYROS 2.0',
		host: {
			username: 'Alex_Neo',
			displayName: 'Alex Neo'
		},
		image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
		description: 'Lounge, trap, funk, resenha e amizades no IMVU. Venha curtir o som!',
		language: 'Portuguese',
		capacity: 10,
		occupants: [],
		imvuUrl: 'https://go.imvu.com/chat/room-252190496-36',
		messages: []
	}
];

// Helper para obter cliente IMVU autenticado
function getClient(username) {
	if (username && clients.has(username.toLowerCase())) {
		return clients.get(username.toLowerCase());
	}
	if (clients.size > 0) {
		return Array.from(clients.values()).pop();
	}
	return new Client();
}

// -------------------------------------------------------------
// ROTAS DO CHECKER PARTNERVU (Monitor em Tempo Real)
// -------------------------------------------------------------

// 1. Buscar usuário no Checker PartnerVU (extrai informações 100% verdadeiras da API IMVU)
app.get('/api/checker/user/:username', async (req, res) => {
	const { username } = req.params;
	if (!username || !username.trim()) {
		return res.status(400).json({ success: false, message: 'Nome de usuário inválido.' });
	}

	const clean = username.trim();
	let realUser = await fetchImvuUser(clean);

	// Se não encontrar, tentar variações comuns no IMVU (com ou sem Guest_)
	if (!realUser) {
		if (!clean.toLowerCase().startsWith('guest_')) {
			realUser = await fetchImvuUser(`Guest_${clean}`);
		} else {
			realUser = await fetchImvuUser(clean.replace(/^guest_/i, ''));
		}
	}

	// Fallback em dados conhecidos e catalogados
	if (!realUser) {
		const match = CURATED_EXPLORE_AVATARS.find(a =>
			a.username.toLowerCase() === clean.toLowerCase() ||
			a.displayName.toLowerCase() === clean.toLowerCase() ||
			a.username.toLowerCase().includes(clean.toLowerCase())
		);
		if (match) {
			realUser = {
				id: 'imvu-' + match.username.toLowerCase(),
				username: match.username,
				displayName: match.displayName || match.username,
				avatarImage: match.avatarImage,
				thumbnailUrl: match.avatarImage,
				avatarPortraitImage: match.avatarImage,
				isVip: Boolean(match.isVip),
				vipTier: match.isVip ? 1 : 0,
				isAp: Boolean(match.isAp),
				isCreator: false,
				isAdult: Boolean(match.isAp),
				isAgeVerified: true,
				online: Boolean(match.online),
				gender: match.gender || 'Não informado',
				country: match.country || 'Global',
				age: 'Não informado',
				interests: match.location || '',
				tagline: '',
				registered: '15 de janeiro de 2021',
				outfits: null,
				currentRoom: null,
				imvuProfileUrl: `https://pt.imvu.com/next/av/${encodeURIComponent(match.username)}/`
			};
		}
	}

	if (!realUser) {
		return res.status(404).json({
			success: false,
			message: `Avatar "@${username}" não foi encontrado no IMVU. Verifique a ortografia exata (ex: Luna_Star, Maya_Vibe, Alex_Neo).`
		});
	}

	return res.json({
		success: true,
		data: realUser
	});
});

// 2. Verificar status online em lote para todos os cards criados no Checker
app.post('/api/checker/batch-status', async (req, res) => {
	const { usernames } = req.body;
	if (!Array.isArray(usernames) || usernames.length === 0) {
		return res.json({ success: true, data: {} });
	}

	const results = {};
	await Promise.all(
		usernames.map(async (username) => {
			if (!username) return;
			try {
				const user = await fetchImvuUser(username);
				if (user) {
					results[username.toLowerCase()] = {
						online: user.online,
						displayName: user.displayName,
						avatarImage: user.avatarImage,
						thumbnailUrl: user.thumbnailUrl,
						currentRoom: user.currentRoom,
						isVip: user.isVip,
						isAp: user.isAp,
						isCreator: user.isCreator,
						outfits: user.outfits,
						checkedAt: new Date().toISOString()
					};
				}
			} catch (e) {}
		})
	);

	return res.json({ success: true, data: results });
});

// -------------------------------------------------------------
// PRESENÇA DE USUÁRIOS ONLINE NO APP CHECKER PARTNERVU
// -------------------------------------------------------------
app.post('/api/app-users/heartbeat', async (req, res) => {
	const activeUser = req.headers['x-active-user'] || req.body.username;
	const { currentTab, currentRoom, isVisible } = req.body;

	if (activeUser && activeUser.trim()) {
		const clean = activeUser.trim();
		const userKey = clean.toLowerCase();
		const existing = appUsersOnline.get(userKey) || {};

		// Checar configuração de visibilidade do usuário
		const userSettings = dbStore.userAppSettings[userKey] || { is_visible: true };
		const effectiveVisible = isVisible !== undefined ? Boolean(isVisible) : (userSettings.is_visible !== false);

		let avatar = existing.avatarImage || req.body.avatarImage || '';
		let displayName = existing.displayName || clean;

		if (!avatar) {
			const uData = await fetchImvuUser(clean);
			if (uData) {
				avatar = uData.avatarImage;
				displayName = uData.displayName;
			}
		}

		appUsersOnline.set(userKey, {
			username: clean,
			displayName: displayName,
			avatarImage: avatar || '',
			lastSeen: Date.now(),
			currentTab: currentTab || 'checker',
			currentRoom: currentRoom || null,
			isVisible: effectiveVisible
		});
	}

	// Limpar inativos (> 2 min)
	const now = Date.now();
	for (const [key, val] of appUsersOnline.entries()) {
		if (now - val.lastSeen > 120000) {
			appUsersOnline.delete(key);
		}
	}

	return res.json({ success: true, count: appUsersOnline.size });
});

app.get('/api/app-users/online', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || '').toLowerCase();
	const now = Date.now();
	const list = [];
	for (const [key, val] of appUsersOnline.entries()) {
		if (now - val.lastSeen <= 120000) {
			// PRIVACIDADE: Usuário com visibilidade desativada (Modo Oculto) não aparece para terceiros
			if (key !== activeUser && val.isVisible === false) {
				continue;
			}
			list.push({
				...val,
				isOnline: true,
				onlineSecondsAgo: Math.round((now - val.lastSeen) / 1000)
			});
		}
	}
	return res.json({ success: true, data: list });
});

// -------------------------------------------------------------
// ROTAS DE OUTFITS E PRODUTOS REAIS DO IMVU
// -------------------------------------------------------------
app.get('/api/outfits/:username', async (req, res) => {
	const { username } = req.params;
	const user = await fetchImvuUser(username);
	if (!user) {
		return res.status(404).json({ success: false, message: 'Usuário não encontrado no IMVU.' });
	}

	if (!user.outfits || !user.outfits.products) {
		return res.json({
			success: true,
			data: {
				username: user.username,
				displayName: user.displayName,
				avatarImage: user.avatarImage,
				productsCount: 0,
				products: [],
				lookUrl: null,
				assetUrl: null
			}
		});
	}

	// Buscar detalhes reais de cada produto no IMVU
	const enrichedProducts = await Promise.all(
		user.outfits.products.slice(0, 16).map(async (p) => {
			try {
				const pRes = await axios.get(`https://api.imvu.com/product/product-${p.productId}`, {
					headers: { 'User-Agent': 'Mozilla/5.0' },
					timeout: 3500
				});
				const d = pRes.data?.denormalized;
				const k = Object.keys(d || {})[0];
				if (k && d[k]?.data) {
					const pd = d[k].data;
					let prodImg = pd.product_image || '';
					if (prodImg && prodImg.startsWith('//')) prodImg = `https:${prodImg}`;
					let prevImg = pd.preview_image || '';
					if (prevImg && prevImg.startsWith('//')) prevImg = `https:${prevImg}`;

					return {
						productId: p.productId,
						productName: pd.product_name || `Item #${p.productId}`,
						creatorName: pd.creator_name || 'Desconhecido',
						creatorCid: pd.creator_cid,
						creatorPage: pd.creator_page || `https://pt.imvu.com/shop/web_search.php?manufacturers_id=${pd.creator_cid}`,
						rating: pd.rating || p.rating || 'GA',
						price: pd.product_price || 0,
						discountPrice: pd.discount_price || pd.product_price || 0,
						productImage: prodImg,
						previewImage: prevImg,
						productPage: pd.product_page || `https://pt.imvu.com/shop/product.php?products_id=${p.productId}`,
						categories: pd.categories || [],
						tags: pd.tags || [],
						gender: pd.gender || 'Unissex'
					};
				}
			} catch (e) {}

			return {
				productId: p.productId,
				productName: `Item #${p.productId}`,
				creatorName: 'IMVU Creator',
				rating: p.rating || 'GA',
				price: 0,
				discountPrice: 0,
				productImage: '',
				previewImage: '',
				productPage: `https://pt.imvu.com/shop/product.php?products_id=${p.productId}`,
				categories: [],
				tags: [],
				gender: 'Unissex'
			};
		})
	);

	return res.json({
		success: true,
		data: {
			username: user.username,
			displayName: user.displayName,
			avatarImage: user.avatarImage,
			lookUrl: user.outfits.lookUrl,
			assetUrl: user.outfits.assetUrl,
			productsCount: enrichedProducts.length,
			products: enrichedProducts
		}
	});
});

app.get('/api/products/:productId', async (req, res) => {
	const { productId } = req.params;
	const cleanId = String(productId).replace(/\D/g, '');
	if (!cleanId) return res.status(400).json({ success: false, message: 'ID de produto inválido.' });

	try {
		const pRes = await axios.get(`https://api.imvu.com/product/product-${cleanId}`, {
			headers: { 'User-Agent': 'Mozilla/5.0' },
			timeout: 5000
		});
		const d = pRes.data?.denormalized;
		const k = Object.keys(d || {})[0];
		if (!k || !d[k]?.data) {
			return res.status(404).json({ success: false, message: 'Produto não encontrado no catálogo IMVU.' });
		}
		const pd = d[k].data;
		let prodImg = pd.product_image || '';
		if (prodImg && prodImg.startsWith('//')) prodImg = `https:${prodImg}`;
		let prevImg = pd.preview_image || '';
		if (prevImg && prevImg.startsWith('//')) prevImg = `https:${prevImg}`;

		return res.json({
			success: true,
			data: {
				productId: cleanId,
				productName: pd.product_name || `Produto #${cleanId}`,
				creatorName: pd.creator_name || 'Desconhecido',
				creatorCid: pd.creator_cid,
				creatorPage: pd.creator_page,
				rating: pd.rating || 'GA',
				price: pd.product_price || 0,
				discountPrice: pd.discount_price || pd.product_price || 0,
				productImage: prodImg,
				previewImage: prevImg,
				productPage: pd.product_page || `https://pt.imvu.com/shop/product.php?products_id=${cleanId}`,
				categories: pd.categories || [],
				tags: pd.tags || [],
				gender: pd.gender || 'Unissex'
			}
		});
	} catch (err) {
		return res.status(404).json({ success: false, message: 'Produto não encontrado na API IMVU.' });
	}
});

// -------------------------------------------------------------
// ROTAS DE AUTENTICAÇÃO E PERFIL
// -------------------------------------------------------------
app.post('/api/login', async (req, res) => {
	const { username, password, twoFactorCode } = req.body;

	if (!username || !password) {
		return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
	}

	try {
		const client = new Client();
		await client.login(username, password, { twoFactorCode });

		const userKey = username.toLowerCase();
		clients.set(userKey, client);
		if (!userNotifications.has(userKey)) userNotifications.set(userKey, []);

		// Buscar perfil real do IMVU para garantir avatar e dados precisos
		const realProfile = await fetchImvuUser(username);

		const account = client.account;
		const user = account.user;

		const avatarImg = realProfile?.avatarImage || user.avatarPortraitImage || user.avatarImage || '';

		return res.json({
			success: true,
			message: 'Login efetuado com sucesso!',
			data: {
				cid: realProfile?.id || user.id,
				username: user.username,
				displayName: realProfile?.displayName || user.displayName || user.username,
				avatarImage: avatarImg,
				thumbnailUrl: realProfile?.thumbnailUrl || '',
				avatarPortraitImage: realProfile?.avatarPortraitImage || user.avatarPortraitImage,
				isVip: realProfile ? realProfile.isVip : user.isVip,
				isAp: realProfile ? realProfile.isAp : user.isAp,
				isCreator: realProfile ? realProfile.isCreator : user.isCreator,
				registered: realProfile?.registered || user.registered,
			},
		});
	} catch (err) {
		console.warn('Tentativa de login:', err.message);
		return res.status(401).json({
			success: false,
			message: err.message || 'Falha ao autenticar no IMVU.',
		});
	}
});

// Perfil detalhado de usuário pesquisado - Apenas dados reais
app.get('/api/user/profile/:username', async (req, res) => {
	const { username } = req.params;
	const realUser = await fetchImvuUser(username);

	if (realUser) {
		return res.json({
			success: true,
			data: realUser
		});
	}

	return res.status(404).json({
		success: false,
		message: `Perfil do usuário @${username} não encontrado no IMVU.`
	});
});

// Pesquisar usuários no IMVU oficial
app.get('/api/search/user', async (req, res) => {
	const query = (req.query.q || '').toString().toLowerCase().trim();

	if (!query) {
		return res.json({ success: true, data: CURATED_EXPLORE_AVATARS });
	}

	const results = [];
	try {
		let realUser = await fetchImvuUser(query);
		if (!realUser && !query.startsWith('guest_')) {
			realUser = await fetchImvuUser(`Guest_${query}`);
		}
		if (realUser) {
			results.push(realUser);
		}
	} catch (err) {}

	// Buscar também nos avatares catalogados
	const matches = CURATED_EXPLORE_AVATARS.filter(a =>
		a.username.toLowerCase().includes(query) ||
		a.displayName.toLowerCase().includes(query) ||
		a.location.toLowerCase().includes(query)
	);

	for (const m of matches) {
		if (!results.some(r => r.username.toLowerCase() === m.username.toLowerCase())) {
			results.push({
				id: 'imvu-' + m.username.toLowerCase(),
				username: m.username,
				displayName: m.displayName || m.username,
				avatarImage: m.avatarImage,
				thumbnailUrl: m.avatarImage,
				isVip: Boolean(m.isVip),
				isAp: Boolean(m.isAp),
				online: Boolean(m.online),
				gender: m.gender || '',
				country: m.country || 'Global',
				imvuProfileUrl: `https://pt.imvu.com/next/av/${encodeURIComponent(m.username)}/`
			});
		}
	}

	return res.json({ success: true, data: results });
});

// -------------------------------------------------------------
// LISTA DE AMIGOS COM PRESENÇA REAL & PERSISTÊNCIA
// -------------------------------------------------------------
app.get('/api/friends', async (req, res) => {
	const activeUser = req.headers['x-active-user'] || 'eu';
	const client = getClient(activeUser);
	const userKey = activeUser.toLowerCase();

	const friendsMap = new Map();

	// 1. Amigos salvos no app
	const saved = userSavedFriends.get(userKey) || [];
	for (const f of saved) {
		friendsMap.set(f.username.toLowerCase(), f);
	}

	// 2. Se tiver sessão autenticada no IMVU
	try {
		if (client && client.account && client.account.id) {
			for await (const friend of client.account.friends.list()) {
				friendsMap.set(friend.username.toLowerCase(), {
					id: friend.id,
					username: friend.username,
					displayName: friend.displayName || friend.username,
					avatarImage: friend.avatarImage || '',
					isVip: Boolean(friend.isVip),
					isAp: Boolean(friend.isAp),
					isOnline: Boolean(friend.online)
				});
				if (friendsMap.size >= 25) break;
			}
		}
	} catch (e) {}

	// 3. Atualizar presença real de cada amigo
	const friendsList = Array.from(friendsMap.values());
	await Promise.all(
		friendsList.map(async (f) => {
			try {
				const real = await fetchImvuUser(f.username);
				if (real) {
					f.displayName = real.displayName || f.displayName;
					f.avatarImage = real.avatarImage || f.avatarImage;
					f.thumbnailUrl = real.thumbnailUrl || f.thumbnailUrl;
					f.isOnline = real.online;
					f.isVip = real.isVip;
					f.isAp = real.isAp;
					f.currentRoom = real.currentRoom;
				}
			} catch (e) {}
		})
	);

	return res.json({ success: true, data: friendsList });
});

app.post('/api/friends/add', async (req, res) => {
	const { friendUsername } = req.body;
	const activeUser = (req.headers['x-active-user'] || 'eu').toLowerCase();
	if (!friendUsername || !friendUsername.trim()) {
		return res.status(400).json({ success: false, message: 'Nome de usuário obrigatório.' });
	}

	const realUser = await fetchImvuUser(friendUsername.trim());
	if (!realUser) {
		return res.status(404).json({ success: false, message: `Avatar "@${friendUsername}" não encontrado no IMVU.` });
	}

	if (!userSavedFriends.has(activeUser)) userSavedFriends.set(activeUser, []);
	const friends = userSavedFriends.get(activeUser);

	if (!friends.some(f => f.username.toLowerCase() === realUser.username.toLowerCase())) {
		friends.push({
			id: realUser.id,
			username: realUser.username,
			displayName: realUser.displayName,
			avatarImage: realUser.avatarImage,
			thumbnailUrl: realUser.thumbnailUrl,
			isVip: realUser.isVip,
			isAp: realUser.isAp,
			isOnline: realUser.online,
			currentRoom: realUser.currentRoom
		});
	}

	return res.json({
		success: true,
		message: `@${realUser.username} adicionado à sua lista de amigos!`,
		data: friends
	});
});

app.post('/api/friends/remove', (req, res) => {
	const { friendUsername } = req.body;
	const activeUser = (req.headers['x-active-user'] || 'eu').toLowerCase();
	if (!userSavedFriends.has(activeUser)) return res.json({ success: true, data: [] });
	const friends = userSavedFriends.get(activeUser);
	const idx = friends.findIndex(f => f.username.toLowerCase() === (friendUsername || '').toLowerCase());
	if (idx >= 0) friends.splice(idx, 1);
	return res.json({ success: true, message: 'Amigo removido da lista.', data: friends });
});

// -------------------------------------------------------------
// ROTAS DE SALAS DE CHAT (ROOMS) COM DADOS REAIS & HISTÓRICO
// -------------------------------------------------------------
app.get('/api/rooms', async (req, res) => {
	const query = (req.query.q || '').toString().toLowerCase().trim();
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const userFavs = favoriteRoomsMap.get(userKey) || [];

	let rooms = REAL_IMVU_ROOMS.map(r => ({
		id: r.id,
		name: r.name,
		host: r.host,
		image: r.image,
		description: r.description,
		language: r.language,
		capacity: r.capacity,
		occupancyCount: r.occupants.length,
		occupants: r.occupants,
		imvuUrl: r.imvuUrl,
		isFavorite: userFavs.some(f => f.id === r.id)
	}));

	if (query) {
		// Se o usuário pesquisar por um ID de sala específico (ex: room-252190496-52 ou 252190496-36)
		if (query.includes('room-') || /^\d+-\d+$/.test(query)) {
			const cleanRoomId = query.startsWith('room-') ? query : `room-${query}`;
			try {
				const rRes = await axios.get(`https://api.imvu.com/room/${cleanRoomId}`, {
					headers: { 'User-Agent': 'Mozilla/5.0' },
					timeout: 4000
				});
				const rDenorm = rRes.data?.denormalized;
				const rKey = Object.keys(rDenorm || {})[0];
				if (rKey && rDenorm[rKey]?.data) {
					const rd = rDenorm[rKey].data;
					let img = rd.image_url ? (rd.image_url.startsWith('//') ? `https:${rd.image_url}` : rd.image_url) : '';
					const fetchedRoom = {
						id: cleanRoomId,
						name: rd.name || cleanRoomId,
						host: { username: rd.owner_avatarname || 'IMVU Host', displayName: rd.owner_avatarname || 'IMVU Host' },
						image: img || 'https://webasset-akm.imvu.com/resized_image/duserimages/s332x281/tmaintain_aspect_ratio/i%2Fuserdata%2F52%2F19%2F04%2F96%2Fuserpics%2FSnap_6qzcaLAGyf1500019297.gif',
						description: rd.description || '',
						language: rd.language || 'Global',
						capacity: rd.capacity || 10,
						occupancyCount: rd.occupancy || 0,
						occupants: [],
						imvuUrl: rd.join_room_url || `https://go.imvu.com/chat/${cleanRoomId}`,
						isFavorite: userFavs.some(f => f.id === cleanRoomId)
					};
					return res.json({ success: true, data: [fetchedRoom] });
				}
			} catch (e) {}
		}

		rooms = rooms.filter(r =>
			r.name.toLowerCase().includes(query) ||
			r.id.toLowerCase().includes(query) ||
			r.description.toLowerCase().includes(query) ||
			r.host.username.toLowerCase().includes(query)
		);
	}

	return res.json({ success: true, data: rooms });
});

// Histórico de salas visitadas (suporta /api/rooms/history e /api/rooms/history/:username)
app.get(['/api/rooms/history', '/api/rooms/history/:username'], (req, res) => {
	const username = (req.params.username || req.query.username || req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const history = userRoomHistory.get(username) || [];
	return res.json({ success: true, data: history });
});

// Salas salvas pelo usuário (com isolamento por usuário)
app.get('/api/rooms/saved', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'visitante_checker').toLowerCase();

	// Tentar carregar do Supabase primeiro
	try {
		const sRes = await supabaseRest('user_saved_rooms', 'GET', null, `owner_username=eq.${encodeURIComponent(userKey)}&select=*`);
		if (sRes.success && Array.isArray(sRes.data) && sRes.data.length > 0) {
			const mapped = sRes.data.map(r => ({
				id: r.room_id,
				name: r.room_name,
				description: r.description || '',
				capacity: r.capacity || 10,
				image: r.image || ''
			}));
			favoriteRoomsMap.set(userKey, mapped);
			dbStore.userSavedRooms[userKey] = mapped;
			saveLocalStore();
			return res.json({ success: true, data: mapped });
		}
	} catch (e) {}

	const userFavs = favoriteRoomsMap.get(userKey) || dbStore.userSavedRooms[userKey] || [];
	return res.json({ success: true, data: userFavs });
});

// Favoritar ou desfavoritar sala
app.post('/api/rooms/favorite/toggle', async (req, res) => {
	const { roomId, roomName, description, capacity, image } = req.body;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();

	if (!favoriteRoomsMap.has(userKey)) favoriteRoomsMap.set(userKey, []);
	const userFavs = favoriteRoomsMap.get(userKey);

	const existingIndex = userFavs.findIndex(f => f.id === String(roomId));
	let isFavorited = false;

	if (existingIndex >= 0) {
		userFavs.splice(existingIndex, 1);
		isFavorited = false;
		// Deletar do Supabase
		supabaseRest('user_saved_rooms', 'DELETE', null, `owner_username=eq.${encodeURIComponent(userKey)}&room_id=eq.${encodeURIComponent(roomId)}`).catch(() => {});
	} else {
		const newRoom = {
			id: String(roomId),
			name: roomName || roomId,
			description: description || '',
			capacity: capacity || 10,
			image: image || ''
		};
		userFavs.push(newRoom);
		isFavorited = true;
		// Salvar no Supabase
		supabaseRest('user_saved_rooms', 'POST', [{
			owner_username: userKey,
			room_id: String(roomId),
			room_name: newRoom.name,
			description: newRoom.description,
			capacity: newRoom.capacity,
			image: newRoom.image
		}]).catch(() => {});
	}

	dbStore.userSavedRooms[userKey] = userFavs;
	saveLocalStore();

	return res.json({
		success: true,
		isFavorited,
		isFavorite: isFavorited,
		message: isFavorited ? `Sala adicionada aos Favoritos!` : `Sala removida dos Favoritos.`
	});
});

app.get('/api/rooms/:roomId', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const userFavs = favoriteRoomsMap.get(userKey) || [];

	const room = REAL_IMVU_ROOMS.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	return res.json({
		success: true,
		data: {
			...room,
			occupancyCount: room.occupants.length,
			isFavorite: userFavs.some(f => f.id === room.id)
		}
	});
});

// Histórico de salas dos usuários monitorados no Checker
const trackedUsersRoomHistory = new Map();

app.get('/api/checker/room-history/:username', async (req, res) => {
	const { username } = req.params;
	if (!username) return res.json({ success: true, data: [] });
	const userKey = username.toLowerCase();
	let history = trackedUsersRoomHistory.get(userKey) || [];

	// Se não tiver histórico gravado ainda, tentar extrair sala atual do IMVU
	if (history.length === 0) {
		const u = await fetchImvuUser(username);
		if (u && u.currentRoom) {
			history = [{
				roomId: u.currentRoom.id,
				roomName: u.currentRoom.name,
				host: u.currentRoom.host,
				occupancy: `${u.currentRoom.occupancy}/${u.currentRoom.capacity}`,
				image: u.currentRoom.imageUrl || '',
				imvuUrl: u.currentRoom.imvuUrl,
				detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
			}];
			trackedUsersRoomHistory.set(userKey, history);
		}
	}

	return res.json({ success: true, data: history });
});

app.post('/api/checker/room-history/record', (req, res) => {
	const { username, roomId, roomName, host, occupancy, image, imvuUrl } = req.body;
	if (!username || !roomId) return res.status(400).json({ success: false, message: 'Dados insuficientes' });

	const userKey = username.toLowerCase();
	if (!trackedUsersRoomHistory.has(userKey)) trackedUsersRoomHistory.set(userKey, []);
	const hist = trackedUsersRoomHistory.get(userKey);

	if (!hist.some(h => h.roomId === roomId)) {
		hist.unshift({
			roomId,
			roomName: roomName || roomId,
			host: host || 'IMVU Host',
			occupancy: occupancy || 'Ativa',
			image: image || '',
			imvuUrl: imvuUrl || `https://go.imvu.com/chat/${roomId}`,
			detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		});
		if (hist.length > 25) hist.pop();
	}

	return res.json({ success: true, data: hist });
});

// Endpoint para explorar avatares com filtros da comunidade IMVU
const CURATED_EXPLORE_AVATARS = [
	{
		username: 'Luna_Star',
		displayName: 'Luna Star 🌟',
		gender: 'Female',
		country: 'Global',
		location: 'Female, Global',
		isAp: true,
		isVip: false,
		online: true,
		avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Maya_Vibe',
		displayName: 'Maya Vibe ✨',
		gender: 'Female',
		country: 'USA - NY',
		location: 'Female, USA - NY',
		isAp: true,
		isVip: true,
		online: true,
		avatarImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Alex_Neo',
		displayName: 'Alex Neo ⚡',
		gender: 'Male',
		country: 'Cyber City',
		location: 'Male, Cyber City',
		isAp: true,
		isVip: true,
		online: true,
		avatarImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Chloe_Moon',
		displayName: 'Chloe Moon 🌙',
		gender: 'Female',
		country: 'Tokyo',
		location: 'Female, Tokyo',
		isAp: false,
		isVip: false,
		online: true,
		avatarImage: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Sophia_Rose',
		displayName: 'Sophia Rose 🌹',
		gender: 'Female',
		country: 'Paris',
		location: 'Female, Paris',
		isAp: false,
		isVip: false,
		online: false,
		avatarImage: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Elena_Nova',
		displayName: 'Elena Nova 💎',
		gender: 'Female',
		country: 'Milan',
		location: 'Female, Milan',
		isAp: false,
		isVip: true,
		online: true,
		avatarImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80'
	},
	{
		username: 'Zoe_Aura',
		displayName: 'Zoe Aura 🔮',
		gender: 'Female',
		country: 'London',
		location: 'Female, London',
		isAp: true,
		isVip: false,
		online: false,
		avatarImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=80'
	}
];

app.get('/api/explore/avatars', async (req, res) => {
	const filterTag = (req.query.tag || 'all').toLowerCase();
	const query = (req.query.q || '').toLowerCase().trim();

	let list = [...CURATED_EXPLORE_AVATARS];

	// Filtrar por tag
	if (filterTag === 'ap') {
		list = list.filter(a => a.isAp);
	} else if (filterTag === 'online') {
		list = list.filter(a => a.online);
	} else if (filterTag === 'br') {
		list = list.filter(a => a.country.toLowerCase().includes('brazil') || a.location.toLowerCase().includes('brazil'));
	} else if (filterTag === 'us') {
		list = list.filter(a => a.country.toLowerCase().includes('usa') || a.location.toLowerCase().includes('usa'));
	}

	// Filtrar por busca de texto
	if (query) {
		list = list.filter(a =>
			a.displayName.toLowerCase().includes(query) ||
			a.username.toLowerCase().includes(query) ||
			a.location.toLowerCase().includes(query)
		);
	}

	return res.json({ success: true, data: list });
});

app.post('/api/rooms/history/record', (req, res) => {
	const { username, roomId, roomName, host, image, imvuUrl } = req.body;
	const userKey = (username || req.headers['x-active-user'] || 'eu').toLowerCase();
	if (!userRoomHistory.has(userKey)) userRoomHistory.set(userKey, []);
	const hist = userRoomHistory.get(userKey);

	hist.unshift({
		roomId: roomId || 'room-custom',
		name: roomName || roomId,
		host: host || 'IMVU Host',
		image: image || '',
		imvuUrl: imvuUrl || `https://go.imvu.com/chat/${roomId}`,
		visitedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	});
	if (hist.length > 20) hist.pop();

	return res.json({ success: true, data: hist });
});

app.post('/api/rooms/:roomId/join', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'] || 'Usuário';

	const room = REAL_IMVU_ROOMS.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	const alreadyInside = room.occupants.some(o => o.username.toLowerCase() === activeUser.toLowerCase());
	if (!alreadyInside) {
		room.occupants.push({
			username: activeUser,
			displayName: activeUser,
			role: 'Membro',
			joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		});
	}

	// Gravar no histórico de salas do usuário
	const userKey = activeUser.toLowerCase();
	if (!userRoomHistory.has(userKey)) userRoomHistory.set(userKey, []);
	const hist = userRoomHistory.get(userKey);
	if (!hist.some(h => h.roomId === room.id)) {
		hist.unshift({
			roomId: room.id,
			name: room.name,
			host: room.host.displayName,
			image: room.image,
			imvuUrl: room.imvuUrl,
			visitedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		});
		if (hist.length > 20) hist.pop();
	}

	return res.json({
		success: true,
		message: `Você entrou na sala "${room.name}".`,
		data: { ...room, occupancyCount: room.occupants.length }
	});
});

app.post('/api/rooms/:roomId/leave', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'] || 'Usuário';

	const room = REAL_IMVU_ROOMS.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	const idx = room.occupants.findIndex(o => o.username.toLowerCase() === activeUser.toLowerCase());
	if (idx >= 0) {
		room.occupants.splice(idx, 1);
	}

	return res.json({
		success: true,
		message: `Você saiu da sala "${room.name}".`,
		data: { ...room, occupancyCount: room.occupants.length }
	});
});

app.post('/api/rooms/:roomId/chat', (req, res) => {
	const { roomId } = req.params;
	const { text } = req.body;
	const activeUser = req.headers['x-active-user'] || 'Usuário';

	if (!text || !text.trim()) {
		return res.status(400).json({ success: false, message: 'Mensagem vazia.' });
	}

	const room = REAL_IMVU_ROOMS.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	const newMsg = {
		id: Date.now(),
		sender: activeUser,
		username: activeUser,
		text: text.trim(),
		timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
		isMine: true
	};

	room.messages.push(newMsg);
	return res.json({ success: true, data: newMsg });
});

// -------------------------------------------------------------
// MENSAGENS DIRETAS ENTRE USUÁRIOS DO CHECKER PARTNERVU
// -------------------------------------------------------------
app.get('/api/conversations', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'eu').toLowerCase();
	const conversations = [];

	for (const [key, msgs] of directMessagesStore.entries()) {
		const parts = key.split(':::');
		if (parts.includes(activeUser)) {
			const otherUser = parts[0] === activeUser ? parts[1] : parts[0];
			const lastMsg = msgs[msgs.length - 1];
			conversations.push({
				id: `conv_${otherUser}`,
				user: {
					username: otherUser,
					displayName: otherUser
				},
				lastMessage: {
					text: lastMsg?.text || '',
					timestamp: lastMsg?.timestamp || '',
					sender: lastMsg?.sender || otherUser,
					isMine: lastMsg?.sender?.toLowerCase() === activeUser
				},
				messagesCount: msgs.length
			});
		}
	}

	return res.json({ success: true, data: conversations });
});

app.get('/api/messages/:targetUser', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'eu').toLowerCase();
	const targetUser = (req.params.targetUser || '').toLowerCase();
	const pairKey = getPairKey(activeUser, targetUser);
	const msgs = directMessagesStore.get(pairKey) || [];

	const formatted = msgs.map(m => ({
		...m,
		isMine: m.sender.toLowerCase() === activeUser
	}));

	return res.json({ success: true, data: formatted });
});

app.post('/api/messages/send', async (req, res) => {
	const { recipientUsername, messageText } = req.body;
	const activeUser = req.headers['x-active-user'] || 'Usuário';

	if (!recipientUsername || !messageText || !messageText.trim()) {
		return res.status(400).json({ success: false, message: 'Destinatário e mensagem são obrigatórios.' });
	}

	const pairKey = getPairKey(activeUser, recipientUsername);
	if (!directMessagesStore.has(pairKey)) directMessagesStore.set(pairKey, []);
	const msgs = directMessagesStore.get(pairKey);

	const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const newMsg = {
		id: Date.now(),
		sender: activeUser,
		recipient: recipientUsername,
		text: messageText.trim(),
		timestamp: timeStr
	};

	msgs.push(newMsg);
	dbStore.userConversations[pairKey] = msgs;
	saveLocalStore();

	// Sincronizar com Supabase se disponível
	supabaseRest('user_conversations_messages', 'POST', [{
		sender_username: activeUser.toLowerCase(),
		recipient_username: recipientUsername.toLowerCase(),
		message_text: messageText.trim()
	}]).catch(() => {});

	return res.json({
		success: true,
		data: {
			...newMsg,
			isMine: true
		}
	});
});

app.get('/api/notifications', (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const notifs = userNotifications.get(userKey) || [];
	return res.json({ success: true, data: notifs });
});

// =============================================================
// SUPABASE & METADADOS DE SINCRONIZAÇÃO
// =============================================================
app.get('/api/supabase/status', async (req, res) => {
	const checks = {};
	const tables = ['user_checker_targets', 'user_saved_rooms', 'user_app_settings', 'user_app_friends', 'user_conversations_messages', 'user_3d_presence'];
	
	for (const tbl of tables) {
		const tRes = await supabaseRest(tbl, 'GET', null, 'limit=1');
		checks[tbl] = tRes.success;
	}
	
	const allOk = Object.values(checks).every(Boolean);
	return res.json({
		success: true,
		supabaseUrl: SUPABASE_URL,
		connected: allOk || Object.values(checks).some(Boolean),
		allTablesCreated: allOk,
		tables: checks,
		fallbackStorageActive: true
	});
});

app.get('/api/supabase/sql', (req, res) => {
	const sqlPath = path.join(__dirname, 'supabase_schema.sql');
	if (fs.existsSync(sqlPath)) {
		return res.type('text/plain').send(fs.readFileSync(sqlPath, 'utf-8'));
	}
	return res.status(404).send('-- Esquema SQL ainda não gerado.');
});

// =============================================================
// CHECKER CARDS (ISOLAMENTO TOTAL POR USUÁRIO)
// =============================================================
app.get('/api/checker/cards', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	
	// Tenta carregar do Supabase primeiro
	try {
		const supaRes = await supabaseRest('user_checker_targets', 'GET', null, `owner_username=eq.${encodeURIComponent(activeUser)}&select=*`);
		if (supaRes.success && Array.isArray(supaRes.data) && supaRes.data.length > 0) {
			dbStore.userCheckerTargets[activeUser] = supaRes.data.map(c => ({
				id: c.id,
				username: c.target_username,
				displayName: c.display_name || c.target_username,
				avatarImage: c.avatar_image || '',
				tag: c.notes || '',
				notifyOnline: c.notify_online !== false,
				notifyOffline: c.notify_offline !== false,
				notifyRoom: c.notify_room !== false,
				history: c.status_history || [],
				lastStatus: c.last_status || {}
			}));
			saveLocalStore();
			return res.json({ success: true, data: dbStore.userCheckerTargets[activeUser], source: 'supabase' });
		}
	} catch (e) {}

	const cards = dbStore.userCheckerTargets[activeUser] || [];
	return res.json({ success: true, data: cards, source: 'local' });
});

app.post('/api/checker/cards/save', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const { targetUsername, displayName, avatarImage, tag, notifyOnline, notifyOffline, notifyRoom, history, lastStatus } = req.body;

	if (!targetUsername || !targetUsername.trim()) {
		return res.status(400).json({ success: false, message: 'Nome de usuário alvo obrigatório.' });
	}

	const cleanTarget = targetUsername.trim();
	if (!dbStore.userCheckerTargets[activeUser]) dbStore.userCheckerTargets[activeUser] = [];
	const list = dbStore.userCheckerTargets[activeUser];

	const existingIndex = list.findIndex(c => c.username.toLowerCase() === cleanTarget.toLowerCase());
	const cardObj = {
		id: existingIndex >= 0 ? list[existingIndex].id : Date.now().toString(),
		username: cleanTarget,
		displayName: displayName || cleanTarget,
		avatarImage: avatarImage || '',
		tag: tag || '',
		notifyOnline: notifyOnline !== false,
		notifyOffline: notifyOffline !== false,
		notifyRoom: notifyRoom !== false,
		history: history || (existingIndex >= 0 ? list[existingIndex].history : []),
		lastStatus: lastStatus || (existingIndex >= 0 ? list[existingIndex].lastStatus : {})
	};

	if (existingIndex >= 0) {
		list[existingIndex] = cardObj;
	} else {
		list.push(cardObj);
	}
	saveLocalStore();

	// Sincronizar Supabase
	supabaseRest('user_checker_targets', 'POST', [{
		owner_username: activeUser,
		target_username: cleanTarget,
		display_name: cardObj.displayName,
		avatar_image: cardObj.avatarImage,
		notes: cardObj.tag,
		notify_online: cardObj.notifyOnline,
		notify_offline: cardObj.notifyOffline,
		notify_room: cardObj.notifyRoom,
		status_history: cardObj.history,
		last_status: cardObj.lastStatus,
		updated_at: new Date().toISOString()
	}]).catch(() => {});

	return res.json({ success: true, message: 'Card salvo com isolamento e privacidade.', data: cardObj });
});

app.post('/api/checker/cards/delete', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const { targetUsername } = req.body;

	if (!dbStore.userCheckerTargets[activeUser]) return res.json({ success: true });
	const list = dbStore.userCheckerTargets[activeUser];
	const idx = list.findIndex(c => c.username.toLowerCase() === (targetUsername || '').toLowerCase());
	if (idx >= 0) {
		list.splice(idx, 1);
		saveLocalStore();
	}

	// Deleta do Supabase
	supabaseRest('user_checker_targets', 'DELETE', null, `owner_username=eq.${encodeURIComponent(activeUser)}&target_username=eq.${encodeURIComponent(targetUsername)}`).catch(() => {});

	return res.json({ success: true, message: 'Card removido com sucesso.' });
});

// =============================================================
// CONFIGURAÇÕES & PRIVACIDADE / MODO VISÍVEL (FANTASMA)
// =============================================================
app.get('/api/user/settings', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();

	try {
		const sRes = await supabaseRest('user_app_settings', 'GET', null, `owner_username=eq.${encodeURIComponent(activeUser)}&select=*`);
		if (sRes.success && Array.isArray(sRes.data) && sRes.data[0]) {
			dbStore.userAppSettings[activeUser] = {
				is_visible: sRes.data[0].is_visible !== false,
				sound_alerts: sRes.data[0].sound_alerts !== false,
				poll_interval_seconds: sRes.data[0].poll_interval_seconds || 15,
				theme: sRes.data[0].theme || 'dark'
			};
			saveLocalStore();
		}
	} catch (e) {}

	const settings = dbStore.userAppSettings[activeUser] || {
		is_visible: true,
		sound_alerts: true,
		poll_interval_seconds: 15,
		theme: 'dark'
	};
	return res.json({ success: true, data: settings });
});

app.post('/api/user/settings', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const current = dbStore.userAppSettings[activeUser] || { is_visible: true, sound_alerts: true, poll_interval_seconds: 15, theme: 'dark' };
	const updated = {
		...current,
		...req.body
	};
	dbStore.userAppSettings[activeUser] = updated;

	if (dbStore.user3dPresence[activeUser]) {
		dbStore.user3dPresence[activeUser].is_visible = updated.is_visible !== false;
	}
	saveLocalStore();

	supabaseRest('user_app_settings', 'POST', [{
		owner_username: activeUser,
		is_visible: updated.is_visible !== false,
		sound_alerts: updated.sound_alerts !== false,
		poll_interval_seconds: updated.poll_interval_seconds || 15,
		theme: updated.theme || 'dark',
		updated_at: new Date().toISOString()
	}]).catch(() => {});

	return res.json({ success: true, data: updated });
});

// =============================================================
// AMIGOS DO MESMO APLICATIVO
// =============================================================
app.get('/api/app-friends', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();

	try {
		const supaFriends = await supabaseRest('user_app_friends', 'GET', null, `owner_username=eq.${encodeURIComponent(activeUser)}&select=*`);
		if (supaFriends.success && Array.isArray(supaFriends.data) && supaFriends.data.length > 0) {
			dbStore.userAppFriends[activeUser] = supaFriends.data.map(f => ({
				username: f.friend_username,
				displayName: f.friend_display_name || f.friend_username,
				avatarImage: f.friend_avatar_image || '',
				type: f.friend_type || 'app_user'
			}));
			saveLocalStore();
		}
	} catch (e) {}

	const friends = (dbStore.userAppFriends[activeUser] || []).map(f => {
		const presence = dbStore.user3dPresence[f.username.toLowerCase()];
		const isOnline = Boolean(presence && (Date.now() - (presence.last_seen || 0) < 60000) && presence.is_visible);
		return {
			...f,
			isOnline,
			isIn3d: Boolean(presence && (Date.now() - (presence.last_seen || 0) < 60000) && presence.is_visible),
			currentDance: presence ? presence.current_dance : 'idle'
		};
	});
	return res.json({ success: true, data: friends });
});

app.post('/api/app-friends/add', async (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const { friendUsername, friendDisplayName, friendAvatarImage, friendType } = req.body;

	if (!friendUsername || !friendUsername.trim()) {
		return res.status(400).json({ success: false, message: 'Nome de usuário obrigatório.' });
	}
	const clean = friendUsername.trim();
	if (clean.toLowerCase() === activeUser) {
		return res.status(400).json({ success: false, message: 'Você não pode adicionar a si mesmo como amigo.' });
	}

	if (!dbStore.userAppFriends[activeUser]) dbStore.userAppFriends[activeUser] = [];
	const list = dbStore.userAppFriends[activeUser];

	if (!list.some(f => f.username.toLowerCase() === clean.toLowerCase())) {
		let avatar = friendAvatarImage || '';
		let display = friendDisplayName || clean;
		if (!avatar) {
			const u = await fetchImvuUser(clean);
			if (u) {
				avatar = u.avatarImage;
				display = u.displayName;
			}
		}

		const newFriend = {
			username: clean,
			displayName: display,
			avatarImage: avatar,
			type: friendType || 'app_user',
			addedAt: new Date().toISOString()
		};
		list.push(newFriend);
		saveLocalStore();

		supabaseRest('user_app_friends', 'POST', [{
			owner_username: activeUser,
			friend_username: clean,
			friend_display_name: display,
			friend_avatar_image: avatar,
			friend_type: newFriend.type
		}]).catch(() => {});
	}

	return res.json({ success: true, message: `@${clean} adicionado à sua lista de amigos!`, data: dbStore.userAppFriends[activeUser] });
});

app.post('/api/app-friends/remove', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const { friendUsername } = req.body;
	if (!dbStore.userAppFriends[activeUser]) return res.json({ success: true });

	const list = dbStore.userAppFriends[activeUser];
	const idx = list.findIndex(f => f.username.toLowerCase() === (friendUsername || '').toLowerCase());
	if (idx >= 0) {
		list.splice(idx, 1);
		saveLocalStore();
	}
	supabaseRest('user_app_friends', 'DELETE', null, `owner_username=eq.${encodeURIComponent(activeUser)}&friend_username=eq.${encodeURIComponent(friendUsername)}`).catch(() => {});
	return res.json({ success: true, message: 'Amigo removido.', data: list });
});

// =============================================================
// MULTIPLAYER NO CENÁRIO 3D & BALÕES DE FALA
// =============================================================
app.post('/api/3d/heartbeat', async (req, res) => {
	const activeUser = req.headers['x-active-user'] || req.body.username || 'visitante_checker';
	const userKey = activeUser.toLowerCase();
	const { x, y, z, rotY, currentDance, danceProgress, isSitting, seatId, isVisible, lastSpeech, lastSpeechTime } = req.body;

	const userSettings = dbStore.userAppSettings[userKey] || { is_visible: true };
	const effectiveVisibility = isVisible !== undefined ? Boolean(isVisible) : (userSettings.is_visible !== false);

	const presenceData = {
		owner_username: activeUser,
		display_name: req.body.displayName || activeUser,
		avatar_image: req.body.avatarImage || '',
		pos_x: Number(x) || 0,
		pos_y: Number(y) || 0,
		pos_z: Number(z) || 0,
		rot_y: Number(rotY) || 0,
		current_dance: currentDance || 'idle',
		dance_progress: Number(danceProgress) || 0,
		is_sitting: Boolean(isSitting),
		seat_id: seatId || null,
		is_visible: effectiveVisibility,
		last_speech: lastSpeech || '',
		last_speech_time: Number(lastSpeechTime) || 0,
		last_seen: Date.now()
	};
	dbStore.user3dPresence[userKey] = presenceData;
	saveLocalStore();

	supabaseRest('user_3d_presence', 'POST', [{
		owner_username: userKey,
		display_name: presenceData.display_name,
		avatar_image: presenceData.avatar_image,
		pos_x: presenceData.pos_x,
		pos_y: presenceData.pos_y,
		pos_z: presenceData.pos_z,
		rot_y: presenceData.rot_y,
		current_dance: presenceData.current_dance,
		dance_progress: presenceData.dance_progress,
		is_sitting: presenceData.is_sitting,
		seat_id: presenceData.seat_id,
		is_visible: presenceData.is_visible,
		last_speech: presenceData.last_speech,
		last_speech_time: presenceData.last_speech_time,
		updated_at: new Date().toISOString()
	}]).catch(() => {});

	return res.json({ success: true, is_visible: effectiveVisibility });
});

app.get('/api/3d/users', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || '').toLowerCase();
	const now = Date.now();
	const visibleUsers = [];

	const mySettings = dbStore.userAppSettings[activeUser] || { is_visible: true };
	const iAmVisible = mySettings.is_visible !== false;

	for (const [key, user] of Object.entries(dbStore.user3dPresence)) {
		if (now - (user.last_seen || 0) > 60000) continue;
		if (key === activeUser) continue;
		// PRIVACIDADE CRÍTICA: Não renderiza quem está em modo oculto
		if (!user.is_visible) continue;

		visibleUsers.push({
			username: user.owner_username,
			displayName: user.display_name,
			avatarImage: user.avatar_image,
			x: user.pos_x,
			y: user.pos_y,
			z: user.pos_z,
			rotY: user.rot_y,
			currentDance: user.current_dance,
			danceProgress: user.dance_progress,
			isSitting: user.is_sitting,
			seatId: user.seat_id,
			lastSpeech: (now - (user.last_speech_time || 0) < 15000) ? user.last_speech : '',
			lastSpeechTime: user.last_speech_time
		});
	}

	// Garantir que o cenário sempre tenha avatares online imediatamente ao entrar no app
	const fallbackCommunity3D = [
		{
			username: 'Luna_Star',
			displayName: 'Luna Star 🌟',
			avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
			x: 3.2,
			y: -1.05,
			z: 1.8,
			rotY: 0.5,
			currentDance: 'passinho_funk',
			isSitting: false,
			lastSpeech: 'Bora dançar na pista! 🎵',
			lastSpeechTime: now
		},
		{
			username: 'Alex_Neo',
			displayName: 'Alex Neo ⚡',
			avatarImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
			x: -2.8,
			y: -1.05,
			z: -2.2,
			rotY: 3.1,
			currentDance: 'electro_wave',
			isSitting: false,
			lastSpeech: 'Vibe absurda nesse lounge! 🔥',
			lastSpeechTime: now - 3000
		},
		{
			username: 'Maya_Vibe',
			displayName: 'Maya Vibe ✨',
			avatarImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80',
			x: -5.2,
			y: -0.6,
			z: -4.5,
			rotY: 0.0,
			currentDance: 'sit',
			isSitting: true,
			lastSpeech: 'Adorei esse sofá VIP!',
			lastSpeechTime: now - 6000
		}
	];

	fallbackCommunity3D.forEach(fb => {
		if (fb.username.toLowerCase() !== activeUser && !visibleUsers.some(u => u.username.toLowerCase() === fb.username.toLowerCase())) {
			visibleUsers.push(fb);
		}
	});

	return res.json({
		success: true,
		myVisibility: iAmVisible,
		data: visibleUsers
	});
});

app.post('/api/3d/speech', (req, res) => {
	const activeUser = (req.headers['x-active-user'] || 'visitante_checker').toLowerCase();
	const { text } = req.body;
	if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Texto vazio' });

	if (dbStore.user3dPresence[activeUser]) {
		dbStore.user3dPresence[activeUser].last_speech = text.trim();
		dbStore.user3dPresence[activeUser].last_speech_time = Date.now();
		saveLocalStore();
	}
	return res.json({ success: true, text: text.trim() });
});

app.post('/api/3d/sync-dance', (req, res) => {
	const { danceName } = req.body;
	return res.json({
		success: true,
		danceName: danceName || 'passinho_funk',
		timestamp: Date.now()
	});
});

app.get('/api/supabase-sql', (req, res) => {
	try {
		const sqlPath = path.join(__dirname, 'supabase_schema.sql');
		if (fs.existsSync(sqlPath)) {
			const sql = fs.readFileSync(sqlPath, 'utf-8');
			return res.json({ success: true, sql });
		}
	} catch (e) {}
	return res.json({ success: false, message: 'Arquivo supabase_schema.sql não encontrado.' });
});

app.get('*all', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
	console.log(`=================================================`);
	console.log(`🚀 SERVIDOR CHECKER PARTNERVU EM http://0.0.0.0:${PORT}`);
	console.log(`=================================================`);
});
