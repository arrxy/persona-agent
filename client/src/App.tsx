import { useEffect, useState } from "react";
import {
  AuthError,
  clearAuth,
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
  fetchCreatorRequests,
  fetchPersonas,
  getCreatorIdFromConversation,
  getCreatorNameFromConversation,
  getStoredUser,
  normalizeChatMode,
  onAuthExpired,
  sendChat,
  submitCreatorRequest,
  type ChatMessage,
  type ChatMode,
  type ConversationSummary,
  type CreatorRequestSummary,
  type Persona,
  type User,
} from "./api";
import { isActiveCreatorRequest } from "./utils";
import AuthPage from "./components/AuthPage";
import ChatView from "./components/ChatView";
import CreatePersonaModal from "./components/CreatePersonaModal";
import PersonaPicker from "./components/PersonaPicker";
import Sidebar from "./components/Sidebar";

type MainView = "picker" | "chat";

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [mainView, setMainView] = useState<MainView>("picker");

  const [pinnedPersonas, setPinnedPersonas] = useState<Persona[]>([]);
  const [explorePersonas, setExplorePersonas] = useState<Persona[]>([]);
  const [creatorRequests, setCreatorRequests] = useState<CreatorRequestSummary[]>(
    [],
  );
  const [personaSearch, setPersonaSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [showSources, setShowSources] = useState<number | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("chat");

  const [createOpen, setCreateOpen] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    void refreshData();
  }, [user]);

  useEffect(() => {
    return onAuthExpired(() => {
      setUser(null);
      setMainView("picker");
      setSelectedPersona(null);
      setConversationId(undefined);
      setActiveConversationId(undefined);
      setMessages([]);
      setPinnedPersonas([]);
      setExplorePersonas([]);
      setCreatorRequests([]);
      setConversations([]);
      setChatError("");
      setChatMode("chat");
    });
  }, []);

  async function refreshData() {
    try {
      const [personaResult, nextConversations, nextRequests] = await Promise.all([
        fetchPersonas(),
        fetchConversations(),
        fetchCreatorRequests(),
      ]);
      setPinnedPersonas(personaResult.pinned);
      setExplorePersonas(personaResult.creators);
      setConversations(nextConversations);
      setCreatorRequests(nextRequests);
    } catch (error) {
      if (error instanceof AuthError) return;
      /* ignore other background refresh errors */
    }
  }

  const allPersonas = [...pinnedPersonas, ...explorePersonas];

  const pendingPersonas = creatorRequests.filter((request) => {
    const creator = request.creatorId;
    const alreadyAdded = allPersonas.some((persona) => {
      if (!creator || typeof creator === "string") return false;
      return persona.id === creator._id;
    });
    if (alreadyAdded) return false;
    return isActiveCreatorRequest(request) || request.status === "failed";
  });

  function handleLogout() {
    clearAuth();
    setUser(null);
    setMainView("picker");
    setSelectedPersona(null);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
    setChatMode("chat");
  }

  function startNewChat() {
    setMainView("picker");
    setSelectedPersona(null);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
    setChatError("");
    setPersonaSearch("");
    setChatMode("chat");
  }

  function selectPersona(persona: Persona) {
    setSelectedPersona(persona);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
    setChatError("");
    setChatMode("chat");
    setMainView("chat");
  }

  async function openConversation(conversation: ConversationSummary) {
    const creatorId = getCreatorIdFromConversation(conversation);
    if (!creatorId) return;

    setChatLoading(true);
    setChatError("");
    try {
      const result = await fetchConversationMessages(conversation._id);
      const persona =
        allPersonas.find((item) => item.id === creatorId) ??
        ({
          id: creatorId,
          name: getCreatorNameFromConversation(conversation),
        } satisfies Persona);

      setSelectedPersona(persona);
      setConversationId(conversation._id);
      setActiveConversationId(conversation._id);
      setChatMode(normalizeChatMode(result.conversation.mode));
      setMessages(
        result.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
      );
      setMainView("chat");
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Failed to load conversation",
      );
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPersona || !input.trim() || chatLoading) return;

    const userMessage = input.trim();
    setInput("");
    setChatError("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setChatLoading(true);

    try {
      const result = await sendChat({
        creatorId: selectedPersona.id,
        message: userMessage,
        conversationId,
        mode: chatMode,
      });
      setConversationId(result.conversationId);
      setActiveConversationId(result.conversationId);
      setChatMode(normalizeChatMode(result.mode));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          sources: result.sources,
        },
      ]);
      void refreshData();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Chat failed");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleDeleteConversation(conversationId: string) {
    if (!window.confirm("Delete this chat?")) return;

    try {
      await deleteConversation(conversationId);
      setConversations((prev) =>
        prev.filter((conversation) => conversation._id !== conversationId),
      );

      if (activeConversationId === conversationId) {
        startNewChat();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete chat");
    }
  }

  async function handleCreatePersona(event: React.FormEvent) {
    event.preventDefault();
    if (!channelUrl.trim()) return;
    setCreateLoading(true);
    try {
      const request = await submitCreatorRequest(channelUrl.trim());
      setCreatorRequests((prev) => {
        const withoutDuplicate = prev.filter((item) => item._id !== request._id);
        return [request, ...withoutDuplicate];
      });
      setChannelUrl("");
      setCreateOpen(false);
      void refreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create persona");
    } finally {
      setCreateLoading(false);
    }
  }

  if (!user) {
    return <AuthPage onSuccess={setUser} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        historySearch={historySearch}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onHistorySearchChange={setHistorySearch}
        onNewChat={startNewChat}
        onSelectConversation={(conversation) => void openConversation(conversation)}
        onDeleteConversation={(conversationId) =>
          void handleDeleteConversation(conversationId)
        }
        onLogout={handleLogout}
      />

      <main className="main-panel">
        {mainView === "picker" ? (
          <PersonaPicker
            pinnedPersonas={pinnedPersonas}
            explorePersonas={explorePersonas}
            pendingRequests={pendingPersonas}
            search={personaSearch}
            onSearchChange={setPersonaSearch}
            onSelect={selectPersona}
            onCreateClick={() => setCreateOpen(true)}
          />
        ) : (
          selectedPersona && (
            <ChatView
              personaName={selectedPersona.name}
              messages={messages}
              input={input}
              loading={chatLoading}
              error={chatError}
              showSources={showSources}
              chatMode={chatMode}
              canDelete={Boolean(conversationId)}
              onInputChange={setInput}
              onChatModeChange={setChatMode}
              onSend={handleSend}
              onToggleSources={(index) =>
                setShowSources(showSources === index ? null : index)
              }
              onDelete={
                conversationId
                  ? () => void handleDeleteConversation(conversationId)
                  : undefined
              }
            />
          )
        )}
      </main>

      <CreatePersonaModal
        open={createOpen}
        channelUrl={channelUrl}
        loading={createLoading}
        onChange={setChannelUrl}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreatePersona}
      />
    </div>
  );
}
