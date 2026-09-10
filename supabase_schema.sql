-- ==============================================================================
-- CHECKER PARTNERVU - ESQUEMA COMPLETO SUPABASE (POSTGRESQL)
-- Projeto: enqntyzoaftatfhovsxw (https://enqntyzoaftatfhovsxw.supabase.co)
--
-- INSTRUÇÕES DE INSTALAÇÃO:
-- 1. Acesse o painel do seu projeto Supabase: https://supabase.com/dashboard/project/enqntyzoaftatfhovsxw
-- 2. Vá até a seção "SQL Editor" (ícone de terminal SQL no menu lateral esquerdo).
-- 3. Clique em "New query", cole todo o conteúdo deste arquivo e clique em "Run" (Executar).
-- 4. Todas as tabelas, índices e políticas de segurança RLS serão criadas instantaneamente!
-- ==============================================================================

-- 1. Habilitar extensão para geração de identificadores UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABELA: user_checker_targets (Alvos monitorados no Checker)
-- Garante que cada usuário tenha SEUS PRÓPRIOS cards de monitoramento,
-- notas, preferências de alerta e histórico de presença privado.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_checker_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_username TEXT NOT NULL,                  -- Dono do card (usuário logado no app)
    target_username TEXT NOT NULL,                 -- Avatar do IMVU sendo monitorado
    display_name TEXT,                             -- Nome de exibição do avatar
    avatar_image TEXT,                             -- URL do avatar IMVU
    notes TEXT DEFAULT '',                         -- Marcador / apelido (ex: Crush, Namorador)
    notify_online BOOLEAN DEFAULT true,            -- Notificar quando entrar online
    notify_offline BOOLEAN DEFAULT true,           -- Notificar quando ficar offline
    notify_room BOOLEAN DEFAULT true,              -- Notificar quando mudar de sala
    status_history JSONB DEFAULT '[]'::jsonb,      -- Histórico detalhado de presenças
    last_status JSONB DEFAULT '{}'::jsonb,         -- Último status capturado (sala, vip, ap)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_owner_target UNIQUE (owner_username, target_username)
);

CREATE INDEX IF NOT EXISTS idx_checker_owner ON public.user_checker_targets(LOWER(owner_username));
CREATE INDEX IF NOT EXISTS idx_checker_target ON public.user_checker_targets(LOWER(target_username));

-- ==============================================================================
-- 3. TABELA: user_saved_rooms (Salas Salvas / Favoritas)
-- Cada usuário gerencia sua própria lista de salas do IMVU favoritas.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_saved_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_username TEXT NOT NULL,                  -- Dono da lista de favoritos
    room_id TEXT NOT NULL,                         -- ID da sala IMVU (ex: room-252190496-52)
    room_name TEXT NOT NULL,                       -- Nome da sala
    description TEXT DEFAULT '',                   -- Descrição da sala
    capacity INT DEFAULT 10,                       -- Capacidade
    image TEXT DEFAULT '',                         -- Imagem oficial da sala
    imvu_url TEXT DEFAULT '',                      -- Link direto para abrir no IMVU
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_owner_room UNIQUE (owner_username, room_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_rooms_owner ON public.user_saved_rooms(LOWER(owner_username));

-- ==============================================================================
-- 4. TABELA: user_app_settings (Configurações e Privacidade do Usuário)
-- Controla preferências do app e o "Modo Fantasma / Visibilidade".
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_app_settings (
    owner_username TEXT PRIMARY KEY,               -- Usuário dono das configurações
    is_visible BOOLEAN DEFAULT true,               -- TRUE = Visível no 3D e online; FALSE = Modo Oculto/Fantasma
    sound_alerts BOOLEAN DEFAULT true,             -- Som de notificação ativo
    poll_interval_seconds INT DEFAULT 15,          -- Intervalo de checagem do Checker
    theme TEXT DEFAULT 'dark',                     -- Tema visual ('dark' ou 'light')
    custom_dance_speed NUMERIC DEFAULT 1.0,        -- Velocidade das animações 3D
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. TABELA: user_app_friends (Amigos do mesmo Aplicativo & IMVU)
-- Permite que usuários do PartnerVU adicionem outros usuários à lista de amigos.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_app_friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_username TEXT NOT NULL,                  -- Usuário que adicionou
    friend_username TEXT NOT NULL,                 -- Amigo adicionado
    friend_display_name TEXT,                      -- Nome de exibição
    friend_avatar_image TEXT,                      -- Avatar
    friend_type TEXT DEFAULT 'app_user',           -- 'app_user' ou 'imvu_avatar'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_owner_friend UNIQUE (owner_username, friend_username)
);

CREATE INDEX IF NOT EXISTS idx_friends_owner ON public.user_app_friends(LOWER(owner_username));

-- ==============================================================================
-- 6. TABELA: user_conversations_messages (Mensagens Diretas & Conversas)
-- Bate-papo persistente entre usuários com isolamento por par de conversa.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_conversations_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_username TEXT NOT NULL,                 -- Remetente
    recipient_username TEXT NOT NULL,              -- Destinatário
    message_text TEXT NOT NULL,                    -- Conteúdo da mensagem
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.user_conversations_messages(LOWER(sender_username));
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.user_conversations_messages(LOWER(recipient_username));

-- ==============================================================================
-- 7. TABELA: user_3d_presence (Presença em Tempo Real no Cenário 3D & Balões)
-- Posição, rotação, pose/dança, sofá/assento, modo de visibilidade e balão de fala.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_3d_presence (
    owner_username TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_image TEXT DEFAULT '',
    pos_x NUMERIC DEFAULT 0,
    pos_y NUMERIC DEFAULT 0,
    pos_z NUMERIC DEFAULT 0,
    rot_y NUMERIC DEFAULT 0,
    current_dance TEXT DEFAULT 'idle',             -- Nome da dança/pose ativa
    dance_progress NUMERIC DEFAULT 0,              -- Progresso na coreografia de 1 minuto
    is_sitting BOOLEAN DEFAULT false,              -- Se está sentado em um sofá/banco
    seat_id TEXT DEFAULT NULL,                     -- Identificador do sofá
    is_visible BOOLEAN DEFAULT true,               -- Se FALSE, não aparece no 3D para os outros
    last_speech TEXT DEFAULT '',                   -- Texto do balão de fala 3D
    last_speech_time BIGINT DEFAULT 0,             -- Timestamp do último balão de fala
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. SEGURANÇA E POLÍTICAS RLS (Row Level Security)
-- Habilita RLS com políticas abertas para chave pública anon do Supabase,
-- permitindo consultas autenticadas e filtradas pelo backend da aplicação.
-- ==============================================================================
ALTER TABLE public.user_checker_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_conversations_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_3d_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon Full Access Checker Targets" ON public.user_checker_targets;
CREATE POLICY "Anon Full Access Checker Targets" ON public.user_checker_targets FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access Saved Rooms" ON public.user_saved_rooms;
CREATE POLICY "Anon Full Access Saved Rooms" ON public.user_saved_rooms FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access Settings" ON public.user_app_settings;
CREATE POLICY "Anon Full Access Settings" ON public.user_app_settings FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access Friends" ON public.user_app_friends;
CREATE POLICY "Anon Full Access Friends" ON public.user_app_friends FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access Messages" ON public.user_conversations_messages;
CREATE POLICY "Anon Full Access Messages" ON public.user_conversations_messages FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access 3D Presence" ON public.user_3d_presence;
CREATE POLICY "Anon Full Access 3D Presence" ON public.user_3d_presence FOR ALL TO anon USING (true) WITH CHECK (true);
