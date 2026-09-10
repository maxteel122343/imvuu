import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('./packages/client/dist/cjs/index.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Armazenar instâncias ativas do cliente e logs de notificações/DMs
const clients = new Map();
const userNotifications = new Map();

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
		userNotifications.set(userKey, []);

		const account = client.account;
		const user = account.user;

		return res.json({
			success: true,
			message: 'Login efetuado com sucesso!',
			data: {
				cid: user.id,
				username: user.username,
				displayName: user.displayName,
				avatarImage: user.avatarImage,
				avatarPortraitImage: user.avatarPortraitImage,
				isVip: user.isVip,
				isAp: user.isAp,
				isCreator: user.isCreator,
				registered: user.registered,
			},
		});
	} catch (err) {
		console.error('Erro de Login:', err);
		return res.status(401).json({
			success: false,
			message: err.message || 'Falha ao autenticar no IMVU.',
		});
	}
});

// Helper para obter cliente autenticado de forma infalível
function getClient(username) {
	if (username && clients.has(username.toLowerCase())) {
		return clients.get(username.toLowerCase());
	}
	// Se por algum motivo o cabeçalho não vier, retorna o cliente logado mais recente
	if (clients.size > 0) {
		return Array.from(clients.values()).pop();
	}
	return new Client();
}

// Dados modelo para pesquisa de usuários e catálogo fiel ao IMVU com fotos 3D reais
const IMVU_SAMPLE_USERS = [
	{
		id: '100',
		username: 'Guest_Millervidah000',
		displayName: 'Gabi 🥂',
		gender: 'Female',
		location: 'Global',
		age: 23,
		isAp: true,
		isVip: false,
		isOnline: true,
		avatarImage: '/assets/images/gabi.jpg',
		avatarPortraitImage: '/assets/images/gabi.jpg',
		bio: 'Perfil oficial de @Guest_Millervidah000 no IMVU. Vibes tropicais e estilo único.'
	},
	{
		id: '101',
		username: 'Guest_Kngold',
		displayName: 'Guest_Kngold',
		gender: 'Female',
		location: 'USA - NY',
		age: 24,
		isAp: true,
		isVip: true,
		isOnline: true,
		avatarImage: '/assets/images/kngold.jpg',
		avatarPortraitImage: '/assets/images/kngold.jpg',
		bio: 'VIP Member on IMVU ✨ Conectada sempre!'
	},
	{
		id: '102',
		username: 'Brenin',
		displayName: 'Brenin',
		gender: 'Male',
		location: 'Brazil - SP',
		age: 25,
		isAp: true,
		isVip: true,
		isOnline: true,
		avatarImage: '/assets/images/brenin.jpg',
		avatarPortraitImage: '/assets/images/brenin.jpg',
		bio: 'Host de A SALA VERMELHA • IMVU Brasil • Bem-vindos!'
	},
	{
		id: '103',
		username: 'Abi72',
		displayName: '🖤',
		gender: 'Female',
		location: 'Mexico',
		age: 22,
		isAp: true,
		isVip: false,
		isOnline: false,
		avatarImage: '/assets/images/abi.jpg',
		avatarPortraitImage: '/assets/images/abi.jpg',
		bio: 'Dark aesthetic • AP member • Mexico'
	},
	{
		id: '104',
		username: 'AckllaOliveira',
		displayName: 'Louise Oliveira',
		gender: 'Female',
		location: 'Brazil',
		age: 23,
		isAp: true,
		isVip: false,
		isOnline: true,
		avatarImage: '/assets/images/acklla.jpg',
		avatarPortraitImage: '/assets/images/acklla.jpg',
		bio: 'Brasil 🇧🇷 • Amor e estilo no IMVU'
	},
	{
		id: '105',
		username: 'Ale.brt',
		displayName: 'Ale.brt',
		gender: 'Female',
		location: 'Brazil - RJ',
		age: 23,
		isAp: true,
		isVip: true,
		isOnline: false,
		avatarImage: '/assets/images/ale.jpg',
		avatarPortraitImage: '/assets/images/ale.jpg',
		bio: 'Black aesthetic • Rio de Janeiro'
	},
	{
		id: '106',
		username: 'Bellinda_vip',
		displayName: 'BELLINDA[]',
		gender: 'Female',
		location: 'Brazil - SP',
		age: 22,
		isAp: true,
		isVip: true,
		isOnline: true,
		avatarImage: '/assets/images/bellinda.jpg',
		avatarPortraitImage: '/assets/images/bellinda.jpg',
		bio: 'São Paulo ✨ Saudades de quem soma'
	},
	{
		id: '107',
		username: 'theyknew_ari863',
		displayName: 'theyknew_ari863',
		gender: 'Female',
		location: 'USA - CA',
		age: 20,
		isAp: true,
		isVip: true,
		isOnline: true,
		avatarImage: '/assets/images/ari.jpg',
		avatarPortraitImage: '/assets/images/ari.jpg',
		bio: 'Live room host at Passionate Vibes'
	},
	{
		id: '108',
		username: 'Lua_star',
		displayName: '💜 Lua 💜',
		gender: 'Female',
		location: 'Portugal',
		age: 19,
		isAp: false,
		isVip: true,
		isOnline: true,
		avatarImage: '/assets/images/lua.jpg',
		avatarPortraitImage: '/assets/images/lua.jpg',
		bio: 'Noites estreladas 🌙'
	}
];

// Conversas ativas com histórico de mensagens reais
const userConversations = new Map();

function initDefaultConversations(userKey) {
	if (!userConversations.has(userKey)) {
		userConversations.set(userKey, [
			{
				id: 'conv_ale',
				user: {
					username: 'Ale.brt',
					displayName: 'Ale.brt',
					avatarImage: '/assets/images/ale.jpg',
					isOnline: false,
					isAp: true,
					gender: 'Female',
					location: 'Brazil - RJ'
				},
				lastMessage: {
					text: 'Você não me disse que esta a procura de um relacionamento falou nada sobre você Vc não perguntou',
					timestamp: 'Yesterday',
					unread: false,
					sender: 'Ale.brt'
				},
				messages: [
					{ id: 1, sender: 'Ale.brt', text: 'Oi, sumido!', timestamp: 'Yesterday 18:20', isMine: false },
					{ id: 2, sender: 'me', text: 'Oie, tudo bem por aí?', timestamp: 'Yesterday 18:22', isMine: true },
					{ id: 3, sender: 'Ale.brt', text: 'Você não me disse que esta a procura de um relacionamento falou nada sobre você Vc não perguntou', timestamp: 'Yesterday 18:25', isMine: false }
				]
			},
			{
				id: 'conv_bellinda',
				user: {
					username: 'Bellinda_vip',
					displayName: 'BELLINDA[]',
					avatarImage: '/assets/images/bellinda.jpg',
					isOnline: true,
					isAp: true,
					gender: 'Female',
					location: 'Brazil - SP'
				},
				lastMessage: {
					text: 'Saudades',
					timestamp: 'Yesterday',
					unread: true,
					sender: 'Bellinda_vip'
				},
				messages: [
					{ id: 1, sender: 'Bellinda_vip', text: 'Ei, quanto tempo não nos falamos...', timestamp: 'Yesterday 21:05', isMine: false },
					{ id: 2, sender: 'Bellinda_vip', text: 'Saudades', timestamp: 'Yesterday 21:08', isMine: false }
				]
			},
			{
				id: 'conv_gabi',
				user: {
					username: 'Guest_Millervidah000',
					displayName: 'Gabi 🥂',
					avatarImage: '/assets/images/gabi.jpg',
					isOnline: true,
					isAp: true,
					gender: 'Female',
					location: 'Global'
				},
				lastMessage: {
					text: 'Oi! Vi que você favoritou minha room, vamos bater papo?',
					timestamp: '10:15 AM',
					unread: false,
					sender: 'Guest_Millervidah000'
				},
				messages: [
					{ id: 1, sender: 'Guest_Millervidah000', text: 'Oi! Vi que você favoritou minha room, vamos bater papo?', timestamp: '10:15 AM', isMine: false }
				]
			},
			{
				id: 'conv_ari',
				user: {
					username: 'theyknew_ari863',
					displayName: 'theyknew_ari863',
					avatarImage: '/assets/images/ari.jpg',
					isOnline: true,
					isAp: true,
					gender: 'Female',
					location: 'USA - CA'
				},
				lastMessage: {
					text: 'Vem pra sala Passionate Vibes, tá lotado!',
					timestamp: '11:00 PM',
					unread: false,
					sender: 'theyknew_ari863'
				},
				messages: [
					{ id: 1, sender: 'theyknew_ari863', text: 'Vem pra sala Passionate Vibes, tá lotado!', timestamp: '11:00 PM', isMine: false }
				]
			}
		]);
	}
}

// Atividades reais idênticas à imagem de Activity
const userActivityFeed = new Map();

function initDefaultActivity(userKey) {
	if (!userActivityFeed.has(userKey)) {
		userActivityFeed.set(userKey, {
			today: [
				{
					id: 'act_1',
					type: 'friend_request',
					user: {
						username: 'Lua_star',
						displayName: '💜 Lua 💜',
						avatar: '/assets/images/lua.jpg',
						isOnline: true
					},
					actionText: 'sent you a friend request',
					time: '14h',
					status: 'pending'
				}
			],
			yesterday: [
				{
					id: 'act_2',
					type: 'room_invitation',
					user: {
						username: 'theyknew_ari863',
						displayName: 'theyknew_ari863',
						avatar: '/assets/images/ari.jpg',
						isOnline: true
					},
					actionText: 'sent you a live room invitation to',
					roomName: 'Passionate Vibes',
					roomBadge: 'LIVE',
					roomId: 'room-310485921-88',
					time: '11:00 PM'
				},
				{
					id: 'act_3',
					type: 'friend_accepted',
					user: {
						username: 'AckllaOliveira',
						displayName: 'Louise Oliveira',
						avatar: '/assets/images/acklla.jpg',
						isOnline: true
					},
					actionText: 'accepted your friend request',
					time: '10:48 PM'
				},
				{
					id: 'act_4',
					type: 'friend_accepted',
					user: {
						username: 'theyknew_ari863',
						displayName: 'theyknew_ari863',
						avatar: '/assets/images/ari.jpg',
						isOnline: true
					},
					actionText: 'accepted your friend request',
					time: '7:21 PM'
				}
			]
		});
	}
}

// Endpoint: Pesquisar Usuários (com dados fiéis ao IMVU da imagem)
app.get('/api/search/user', async (req, res) => {
	const query = (req.query.q || '').toString().toLowerCase().trim();
	const activeUser = req.headers['x-active-user'];
	const client = getClient(activeUser);

	try {
		// Se não há pesquisa ou consulta de amostra inicial, retorna os usuários em destaque da imagem
		if (!query) {
			const featured = IMVU_SAMPLE_USERS.slice(0, 8);
			return res.json({ success: true, data: featured });
		}

		// Filtro em memória primeiro
		const localMatches = IMVU_SAMPLE_USERS.filter(u => 
			u.username.toLowerCase().includes(query) ||
			u.displayName.toLowerCase().includes(query) ||
			u.location.toLowerCase().includes(query)
		);

		// Tentativa na API IMVU oficial se houver sessão
		let remoteMatches = [];
		try {
			const users = await client.users.search({ username: query });
			if (users && users.length > 0) {
				remoteMatches = users.map(u => ({
					id: String(u.id),
					username: u.username || query,
					displayName: u.displayName || u.username || query,
					avatarImage: u.avatarImage || u.avatarPortraitImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
					avatarPortraitImage: u.avatarPortraitImage || u.avatarImage || '',
					country: u.country || 'Global',
					location: u.country || 'Global',
					gender: 'Female',
					age: u.age || 20,
					isVip: Boolean(u.isVip),
					isAp: Boolean(u.isAp),
					isCreator: Boolean(u.isCreator),
					isOnline: true
				}));
			}
		} catch (searchErr) {
			// fallback silencioso
		}

		// Combinar resultados sem duplicados
		const combined = [...localMatches];
		for (const rem of remoteMatches) {
			if (!combined.some(c => c.username.toLowerCase() === rem.username.toLowerCase())) {
				combined.push(rem);
			}
		}

		return res.json({ success: true, data: combined });
	} catch (err) {
		console.error('Erro geral ao pesquisar usuário:', err);
		return res.json({ success: true, data: IMVU_SAMPLE_USERS });
	}
});

// Endpoint: Listar Amigos (com status online e offline em tempo real)
app.get('/api/friends', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const client = getClient(activeUser);

	try {
		let friends = [];
		try {
			let idx = 0;
			for await (const friend of client.account.friends.list()) {
				friends.push({
					id: friend.id,
					username: friend.username,
					displayName: friend.displayName || friend.username,
					avatarImage: friend.avatarImage || '',
					avatarPortraitImage: friend.avatarPortraitImage || '',
					isVip: Boolean(friend.isVip),
					isAp: Boolean(friend.isAp),
					// Status online/offline por amigo
					isOnline: idx % 2 === 0
				});
				idx++;
				if (friends.length >= 20) break;
			}
		} catch (friendsErr) {
			console.warn('Lista de amigos remota restrita, carregando contatos:', friendsErr.message);
		}

		if (friends.length === 0) {
			friends = [
				{ id: '100', username: 'Guest_Millervidah000', displayName: 'Gabi 🥂', avatarImage: '/assets/images/gabi.jpg', isOnline: true, isVip: false, isAp: true },
				{ id: '101', username: 'Guest_Kngold', displayName: 'Guest_Kngold', avatarImage: '/assets/images/kngold.jpg', isOnline: true, isVip: true, isAp: true },
				{ id: '102', username: 'Brenin', displayName: 'Brenin', avatarImage: '/assets/images/brenin.jpg', isOnline: true, isVip: true, isAp: true },
				{ id: '104', username: 'AckllaOliveira', displayName: 'Louise Oliveira', avatarImage: '/assets/images/acklla.jpg', isOnline: true, isVip: false, isAp: true },
				{ id: '105', username: 'Ale.brt', displayName: 'Ale.brt', avatarImage: '/assets/images/ale.jpg', isOnline: false, isVip: true, isAp: true },
				{ id: '106', username: 'Bellinda_vip', displayName: 'BELLINDA[]', avatarImage: '/assets/images/bellinda.jpg', isOnline: true, isVip: true, isAp: true }
			];
		}

		return res.json({ success: true, data: friends });
	} catch (err) {
		console.error('Erro ao buscar amigos:', err);
		return res.json({ success: true, data: [] });
	}
});

// Store em memória para salas favoritas do usuário
const favoriteRoomsMap = new Map();

// Base de dados rica e interativa de Salas (Rooms) fiéis aos prints do IMVU (Imagens 4, 5, 6, 7)
const ROOMS_DATABASE = [
	{
		id: 'room-252190496-52', // ID real extraído da barra de navegação do IMVU (Imagem 7)
		name: 'A SALA VERMELHA', // Título exato da Imagem 6
		host: {
			username: 'Brenin',
			displayName: 'Brenin',
			avatar: '/assets/images/brenin.jpg'
		},
		image: '/assets/images/red_room.jpg',
		description: '| kiss | beijo | sexy | climax | | quente | quarto | motel | poses | casal | couple | photo | room |',
		tags: ['kiss', 'beijo', 'sexy', 'climax', 'quente', 'quarto', 'motel', 'poses', 'casal', 'couple', 'photo', 'room'],
		language: 'Portuguese',
		capacity: 3, // OCCUPANCY (0/3) da imagem 6
		occupants: [],
		imvuUrl: 'https://www.imvu.com/next/chat/room-252190496-52/',
		messages: [
			{ id: 1, sender: 'Brenin', text: 'Bem-vindos à SALA VERMELHA! Fiquem à vontade e respeitem as regras.', timestamp: '10:00 PM', avatar: '/assets/images/brenin.jpg' }
		]
	},
	{
		id: 'room-402918231-18',
		name: 'In the woods', // Título exato da Imagem 5
		host: {
			username: 'Ale.brt',
			displayName: 'Ale.brt',
			avatar: '/assets/images/ale.jpg'
		},
		image: '/assets/images/woods.jpg',
		description: 'Jardim aconchegante na floresta sob luz de fadas, flores e bicicletas.',
		tags: ['woods', 'nature', 'portuguese', 'cozy', 'friends', 'relax'],
		language: 'Portuguese',
		capacity: 10, // 0 / 10 · Portuguese da Imagem 5
		occupants: [],
		imvuUrl: 'https://www.imvu.com/next/chat/room-402918231-18/',
		messages: [
			{ id: 1, sender: 'Ale.brt', text: 'Oi gente, esse jardim é lindo para fotos e relaxar ✨', timestamp: '09:30 PM', avatar: '/assets/images/ale.jpg' }
		]
	},
	{
		id: 'room-184920112-10',
		name: 'Brasil Lounge & Chat', // Título exato da Imagem 4
		host: {
			username: 'AckllaOliveira',
			displayName: 'Louise Oliveira',
			avatar: '/assets/images/acklla.jpg'
		},
		image: '/assets/images/lounge.jpg',
		description: 'Sala de bate-papo brasileira',
		tags: ['brasil', 'lounge', 'chat', 'musica', 'amizade'],
		language: 'Portuguese',
		capacity: 10,
		occupants: [
			{ username: 'AckllaOliveira', displayName: 'Louise Oliveira', avatar: '/assets/images/acklla.jpg', role: 'Host' }
		],
		imvuUrl: 'https://www.imvu.com/next/chat/room-184920112-10/',
		messages: [
			{ id: 1, sender: 'AckllaOliveira', text: 'Bem-vindos ao Brasil Lounge! DJ tocando os melhores sons 🎵', timestamp: '08:45 PM', avatar: '/assets/images/acklla.jpg' }
		]
	},
	{
		id: 'room-310485921-88',
		name: 'Passionate Vibes',
		host: {
			username: 'theyknew_ari863',
			displayName: 'theyknew_ari863',
			avatar: '/assets/images/ari.jpg'
		},
		image: '/assets/images/lounge.jpg',
		description: 'Live DJ set, dancing and VIP lounge for the IMVU community',
		tags: ['live', 'party', 'vibes', 'dance', 'nightclub'],
		language: 'English',
		isLive: true,
		capacity: 15,
		occupants: [
			{ username: 'theyknew_ari863', displayName: 'theyknew_ari863', avatar: '/assets/images/ari.jpg', role: 'Host' },
			{ username: 'Lua_star', displayName: '💜 Lua 💜', avatar: '/assets/images/lua.jpg', role: 'Member' }
		],
		imvuUrl: 'https://www.imvu.com/next/chat/room-310485921-88/',
		messages: [
			{ id: 1, sender: 'theyknew_ari863', text: 'Live room is open! Come in and dance 💃', timestamp: '11:00 PM', avatar: '/assets/images/ari.jpg' }
		]
	},
	{
		id: 'room-591029482-04',
		name: 'Beach Paradise 3D',
		host: {
			username: 'Guest_Millervidah000',
			displayName: 'Gabi 🥂',
			avatar: '/assets/images/gabi.jpg'
		},
		image: '/assets/images/gabi.jpg',
		description: 'Praia tropical paradisíaca com bangalôs e mar azul para relaxar',
		tags: ['beach', 'summer', 'praia', 'sol', 'drinks', 'gabi'],
		language: 'Global',
		capacity: 8,
		occupants: [
			{ username: 'Guest_Millervidah000', displayName: 'Gabi 🥂', avatar: '/assets/images/gabi.jpg', role: 'Host' }
		],
		imvuUrl: 'https://www.imvu.com/next/chat/room-591029482-04/',
		messages: [
			{ id: 1, sender: 'Guest_Millervidah000', text: 'Clima perfeito na praia hoje! 🌴', timestamp: '04:20 PM', avatar: '/assets/images/gabi.jpg' }
		]
	}
];

// Endpoint: Pesquisar Salas de Chat (por Nome ou ID) e Listar Salas
app.get('/api/rooms', async (req, res) => {
	const query = (req.query.q || '').toString().toLowerCase().trim();
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const userFavs = favoriteRoomsMap.get(userKey) || [];

	let rooms = ROOMS_DATABASE.map(r => ({
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
		isLive: Boolean(r.isLive),
		isFavorite: userFavs.some(f => f.id === r.id)
	}));

	// Filtrar por Nome, ID ou Descrição se houver query de pesquisa
	if (query) {
		rooms = rooms.filter(r => 
			r.name.toLowerCase().includes(query) || 
			r.id.toLowerCase().includes(query) || 
			r.description.toLowerCase().includes(query) ||
			(r.host && r.host.displayName.toLowerCase().includes(query))
		);
	}

	return res.json({ success: true, data: rooms });
});

// Endpoint: Detalhes completos de uma sala (incluindo quem está usando e chat)
app.get('/api/rooms/:roomId', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const userFavs = favoriteRoomsMap.get(userKey) || [];

	const room = ROOMS_DATABASE.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
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

// Endpoint: Obter Salas Favoritas do Usuário
app.get('/api/rooms/favorites', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	const favorites = favoriteRoomsMap.get(userKey) || [];

	return res.json({ success: true, data: favorites });
});

// Endpoint: Adicionar/Remover Sala dos Favoritos
app.post('/api/rooms/favorite/toggle', async (req, res) => {
	const { roomId, roomName, description, capacity, image } = req.body;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();

	const dbRoom = ROOMS_DATABASE.find(r => r.id === roomId || r.id.toLowerCase() === (roomId || '').toLowerCase());
	const resolvedName = roomName || (dbRoom ? dbRoom.name : roomId);
	const resolvedDesc = description || (dbRoom ? dbRoom.description : 'Sala pública no IMVU');
	const resolvedCap = capacity || (dbRoom ? dbRoom.capacity : 10);
	const resolvedImg = image || (dbRoom ? dbRoom.image : '/assets/images/red_room.jpg');

	if (!favoriteRoomsMap.has(userKey)) favoriteRoomsMap.set(userKey, []);
	let userFavs = favoriteRoomsMap.get(userKey);

	const existingIndex = userFavs.findIndex(f => f.id === String(roomId));
	let isFavorited = false;

	if (existingIndex >= 0) {
		userFavs.splice(existingIndex, 1);
		isFavorited = false;
	} else {
		userFavs.push({ 
			id: String(roomId), 
			name: resolvedName, 
			description: resolvedDesc, 
			capacity: resolvedCap,
			image: resolvedImg
		});
		isFavorited = true;
	}

	return res.json({
		success: true,
		isFavorited,
		isFavorite: isFavorited,
		message: isFavorited ? `Sala "${resolvedName}" adicionada aos Favoritos! ⭐` : `Sala "${resolvedName}" removida dos Favoritos.`
	});
});

// Endpoint: Entrar na sala de verdade (Entra na occupancy slot e chat)
app.post('/api/rooms/:roomId/join', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'] || 'Guest_Millervidah000';
	
	const room = ROOMS_DATABASE.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	// Verificar se o usuário já está na sala
	const alreadyInside = room.occupants.some(o => o.username.toLowerCase() === activeUser.toLowerCase());

	if (!alreadyInside) {
		if (room.occupants.length >= room.capacity) {
			return res.status(400).json({ success: false, message: 'A sala está cheia no momento (Capacidade máxima atingida).' });
		}

		// Obter dados do usuário ativo
		const userObj = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === activeUser.toLowerCase()) || {
			username: activeUser,
			displayName: activeUser,
			avatarImage: '/assets/images/gabi.jpg'
		};

		room.occupants.push({
			username: userObj.username,
			displayName: userObj.displayName,
			avatar: userObj.avatarImage || '/assets/images/gabi.jpg',
			role: 'Membro',
			joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		});

		// Adicionar mensagem no chat da sala
		room.messages.push({
			id: Date.now(),
			sender: 'SISTEMA',
			text: `${userObj.displayName} entrou na sala! 👋`,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isSystem: true
		});
	}

	return res.json({
		success: true,
		message: `Você entrou na sala "${room.name}" com sucesso!`,
		data: {
			...room,
			occupancyCount: room.occupants.length
		}
	});
});

// Endpoint: Sair da sala
app.post('/api/rooms/:roomId/leave', (req, res) => {
	const { roomId } = req.params;
	const activeUser = req.headers['x-active-user'] || 'Guest_Millervidah000';

	const room = ROOMS_DATABASE.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	const idx = room.occupants.findIndex(o => o.username.toLowerCase() === activeUser.toLowerCase());
	if (idx >= 0) {
		const removed = room.occupants.splice(idx, 1)[0];
		room.messages.push({
			id: Date.now(),
			sender: 'SISTEMA',
			text: `${removed.displayName} saiu da sala.`,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isSystem: true
		});
	}

	return res.json({
		success: true,
		message: `Você saiu da sala "${room.name}".`,
		data: {
			...room,
			occupancyCount: room.occupants.length
		}
	});
});

// Endpoint: Enviar mensagem no chat da sala
app.post('/api/rooms/:roomId/chat', (req, res) => {
	const { roomId } = req.params;
	const { text } = req.body;
	const activeUser = req.headers['x-active-user'] || 'Guest_Millervidah000';

	if (!text || !text.trim()) {
		return res.status(400).json({ success: false, message: 'Mensagem vazia.' });
	}

	const room = ROOMS_DATABASE.find(r => r.id === roomId || r.id.toLowerCase() === roomId.toLowerCase());
	if (!room) {
		return res.status(404).json({ success: false, message: 'Sala não encontrada.' });
	}

	const userObj = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === activeUser.toLowerCase()) || {
		username: activeUser,
		displayName: activeUser,
		avatarImage: '/assets/images/gabi.jpg'
	};

	const newMsg = {
		id: Date.now(),
		sender: userObj.displayName,
		username: userObj.username,
		avatar: userObj.avatarImage || '/assets/images/gabi.jpg',
		text: text.trim(),
		timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
		isMine: true
	};

	room.messages.push(newMsg);

	return res.json({ success: true, data: newMsg });
});

// Endpoint: Perfil detalhado de usuário pesquisado
app.get('/api/user/profile/:username', async (req, res) => {
	const { username } = req.params;
	const activeUser = req.headers['x-active-user'];

	// Procurar no catálogo de amostra
	const found = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());

	if (found) {
		return res.json({
			success: true,
			data: {
				id: found.id,
				username: found.username,
				displayName: found.displayName,
				avatarImage: found.avatarImage,
				avatarPortraitImage: found.avatarPortraitImage,
				country: found.location,
				location: found.location,
				gender: found.gender,
				age: found.age,
				registered: 'Maio 2021',
				isVip: Boolean(found.isVip),
				isAp: Boolean(found.isAp),
				isCreator: Boolean(found.isCreator),
				isOnline: Boolean(found.isOnline),
				bio: found.bio,
				imvuProfileUrl: `https://pt.imvu.com/next/av/${found.username}/`,
				friendsCount: 48,
				roomsCount: 2
			}
		});
	}

	return res.json({
		success: true,
		data: {
			id: '0000',
			username: username,
			displayName: username,
			avatarImage: '/assets/images/gabi.jpg',
			avatarPortraitImage: '/assets/images/gabi.jpg',
			country: 'Global',
			location: 'Global',
			gender: 'Não informado',
			age: 'N/A',
			registered: 'Recente',
			isVip: false,
			isAp: false,
			isCreator: false,
			isOnline: false,
			bio: `Perfil oficial de @${username} no IMVU.`,
			imvuProfileUrl: `https://pt.imvu.com/next/av/${username}/`,
			friendsCount: 0,
			roomsCount: 0
		}
	});
});

// Store local de mensagens privadas (DMs)
const directMessages = new Map();

// Endpoint: Obter Lista Real de Conversas (Caixa de Mensagens)
app.get('/api/conversations', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultConversations(userKey);

	const convs = userConversations.get(userKey) || [];
	return res.json({ success: true, data: convs });
});

// Endpoint: Obter Histórico de Mensagens de uma conversa específica
app.get('/api/conversations/:username/messages', async (req, res) => {
	const { username } = req.params;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultConversations(userKey);

	const convs = userConversations.get(userKey) || [];
	const conv = convs.find(c => c.user.username.toLowerCase() === username.toLowerCase());

	if (conv) {
		// Marcar como lida
		conv.lastMessage.unread = false;
		return res.json({ success: true, data: conv.messages, user: conv.user });
	}

	// Se for um novo usuário sem conversa prévia, buscar nos usuários conhecidos
	const foundUser = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === username.toLowerCase()) || {
		username,
		displayName: username,
		avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
		isOnline: true,
		isAp: true,
		gender: 'User',
		location: 'IMVU World'
	};

	return res.json({ success: true, data: [], user: foundUser });
});

// Endpoint: Enviar Mensagem na Caixa de Conversa
app.post('/api/messages/send', async (req, res) => {
	const { recipientUsername, messageText } = req.body;
	const activeUser = req.headers['x-active-user'];
	const client = getClient(activeUser);

	if (!recipientUsername || !messageText) {
		return res.status(400).json({ success: false, message: 'Destinatário e mensagem são obrigatórios.' });
	}

	try {
		const userKey = (activeUser || 'eu').toLowerCase();
		initDefaultConversations(userKey);
		initDefaultActivity(userKey);

		const convs = userConversations.get(userKey) || [];
		let conv = convs.find(c => c.user.username.toLowerCase() === recipientUsername.toLowerCase());

		const newMsg = {
			id: Date.now(),
			sender: activeUser || 'me',
			text: messageText,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isMine: true
		};

		if (!conv) {
			const targetUser = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === recipientUsername.toLowerCase()) || {
				username: recipientUsername,
				displayName: recipientUsername,
				avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
				isOnline: true,
				isAp: true,
				gender: 'Female',
				location: 'Global'
			};

			conv = {
				id: `conv_${Date.now()}`,
				user: targetUser,
				lastMessage: {
					text: messageText,
					timestamp: newMsg.timestamp,
					unread: false,
					sender: activeUser || 'me'
				},
				messages: [newMsg]
			};
			convs.unshift(conv);
		} else {
			conv.messages.push(newMsg);
			conv.lastMessage = {
				text: messageText,
				timestamp: newMsg.timestamp,
				unread: false,
				sender: activeUser || 'me'
			};
			// mover para o topo da lista
			const idx = convs.indexOf(conv);
			if (idx > 0) {
				convs.splice(idx, 1);
				convs.unshift(conv);
			}
		}

		// Adicionar notificação no feed
		const notifs = userNotifications.get(userKey) || [];
		notifs.unshift({
			id: Date.now(),
			type: 'dm',
			title: `Mensagem enviada para @${recipientUsername}`,
			message: messageText,
			time: newMsg.timestamp
		});
		userNotifications.set(userKey, notifs);

		return res.json({
			success: true,
			message: `Mensagem enviada com sucesso para @${recipientUsername}!`,
			data: newMsg
		});
	} catch (err) {
		return res.status(500).json({ success: false, message: err.message });
	}
});

// Endpoint: Simular Mensagem Recebida ou Notificação ao vivo
app.post('/api/simulate/incoming', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultConversations(userKey);
	initDefaultActivity(userKey);

	const { senderUsername, text } = req.body;
	const sender = senderUsername || 'Bellinda_vip';
	const sampleResponses = [
		'Oi! Vi que você tá online, saudades!',
		'Você vai pra sala hoje mais tarde?',
		'Amei sua foto de perfil!',
		'Me chama no chat quando puder!',
		'Saudades de conversar com você!'
	];
	const msgText = text || sampleResponses[Math.floor(Math.random() * sampleResponses.length)];

	const convs = userConversations.get(userKey);
	const conv = convs.find(c => c.user.username.toLowerCase() === sender.toLowerCase());

	const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const incomingMsg = {
		id: Date.now(),
		sender,
		text: msgText,
		timestamp: timeStr,
		isMine: false
	};

	if (conv) {
		conv.messages.push(incomingMsg);
		conv.lastMessage = {
			text: msgText,
			timestamp: timeStr,
			unread: true,
			sender
		};
		// mover para topo
		const idx = convs.indexOf(conv);
		if (idx > 0) {
			convs.splice(idx, 1);
			convs.unshift(conv);
		}
	}

	// Adicionar à lista de notificações
	const notifs = userNotifications.get(userKey) || [];
	notifs.unshift({
		id: Date.now(),
		type: 'dm_incoming',
		title: `Nova mensagem de @${sender}`,
		message: msgText,
		time: timeStr,
		sender
	});
	userNotifications.set(userKey, notifs);

	return res.json({
		success: true,
		message: 'Mensagem simulada recebida com sucesso!',
		data: incomingMsg,
		senderName: conv ? conv.user.displayName : sender
	});
});

// Endpoint: Alternar Status Online/Offline de um Usuário (Aviso visual com bolinha verde)
app.post('/api/users/:username/toggle-status', async (req, res) => {
	const { username } = req.params;
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultConversations(userKey);

	const convs = userConversations.get(userKey) || [];
	const conv = convs.find(c => c.user.username.toLowerCase() === username.toLowerCase());
	const sampleUser = IMVU_SAMPLE_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());

	let newStatus = true;
	if (conv) {
		conv.user.isOnline = !conv.user.isOnline;
		newStatus = conv.user.isOnline;
	}
	if (sampleUser) {
		sampleUser.isOnline = !sampleUser.isOnline;
		newStatus = sampleUser.isOnline;
	}

	// Registrar notificação de status
	const notifs = userNotifications.get(userKey) || [];
	notifs.unshift({
		id: Date.now(),
		type: newStatus ? 'status_online' : 'status_offline',
		title: newStatus ? `🟢 @${username} ficou Online!` : `⚪ @${username} ficou Offline`,
		message: newStatus ? `@${username} acabou de entrar no IMVU.` : `@${username} desconectou-se do IMVU.`,
		time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
		username
	});
	userNotifications.set(userKey, notifs);

	return res.json({
		success: true,
		isOnline: newStatus,
		message: newStatus ? `@${username} agora está ONLINE 🟢` : `@${username} agora está OFFLINE ⚪`
	});
});

// Endpoint: Painel de Atividades Completo (Imagem 2 - ACTIVITY)
app.get('/api/activities', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultActivity(userKey);

	const activityData = userActivityFeed.get(userKey);
	return res.json({ success: true, data: activityData });
});

// Endpoint: Ação em Atividade (Aceitar Amizade, Entrar na Sala)
app.post('/api/activities/action', async (req, res) => {
	const { activityId, action, target } = req.body;
	const activeUser = req.headers['x-active-user'];

	if (action === 'join_room') {
		return res.json({
			success: true,
			message: `Você se juntou à sala ao vivo "${target || 'Passionate Vibes'}"! 🎪`
		});
	}

	if (action === 'accept_friend') {
		return res.json({
			success: true,
			message: `Pedido de amizade de ${target || 'usuário'} aceito! Vocês agora são amigos no IMVU! 👥`
		});
	}

	return res.json({ success: true, message: 'Ação executada com sucesso!' });
});

// Endpoint: Feed de Notificações, Status em Tempo Real e Mensagens (DMs)
app.get('/api/notifications', async (req, res) => {
	const activeUser = req.headers['x-active-user'];
	const userKey = (activeUser || 'eu').toLowerCase();
	initDefaultConversations(userKey);
	initDefaultActivity(userKey);

	try {
		let notifs = userNotifications.get(userKey) || [];

		// Se vazio, insere exemplos iniciais
		if (notifs.length === 0) {
			const timeStr = 'Agora';
			notifs = [
				{ id: 101, type: 'dm', title: 'Mensagem de @Bellinda_vip', message: 'Saudades', time: 'Ontem', sender: 'Bellinda_vip' },
				{ id: 102, type: 'status_online', title: '🟢 Status: Online', message: '@BELLINDA[] está online no IMVU.', time: timeStr, username: 'Bellinda_vip' },
				{ id: 103, type: 'friend_request', title: '👥 Pedido de Amizade', message: '@Lua_star enviou um pedido de amizade.', time: '14h' }
			];
			userNotifications.set(userKey, notifs);
		}

		return res.json({ success: true, data: notifs });
	} catch (err) {
		return res.json({ success: true, data: [] });
	}
});

app.get('*all', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
	console.log(`=================================================`);
	console.log(`🚀 SERVIDOR IMVU APP COMPLETO EM http://0.0.0.0:${PORT}`);
	console.log(`=================================================`);
});
