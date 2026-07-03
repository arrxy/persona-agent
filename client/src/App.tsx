import { useEffect, useState } from "react";
import {
  clearAuth,
  fetchConversationMessages,
  fetchConversations,
  fetchPersonas,
  getCreatorIdFromConversation,
  getCreatorNameFromConversation,
  getStoredUser,
  sendChat,
  submitCreatorRequest,
  type ChatMessage,
  type ConversationSummary,
  type Persona,
  type User,
} from "./api";
import AuthPage from "./components/AuthPage";
import ChatView from "./components/ChatView";
import CreatePersonaModal from "./components/CreatePersonaModal";
import PersonaPicker from "./components/PersonaPicker";
import Sidebar from "./components/Sidebar";

type MainView = "picker" | "chat";

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [mainView, setMainView] = useState<MainView>("picker");

  const [personas, setPersonas] = useState<Persona[]>([]);
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

  const [createOpen, setCreateOpen] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    void refreshData();
    const interval = setInterval(() => void refreshData(), 15000);
    return () => clearInterval(interval);
  }, [user]);

  async function refreshData() {
    try {
      const [nextPersonas, nextConversations] = await Promise.all([
        fetchPersonas(),
        fetchConversations(),
      ]);
      setPersonas(nextPersonas);
      setConversations(nextConversations);
    } catch {
      /* ignore background refresh errors */
    }
  }

  function handleLogout() {
    clearAuth();
    setUser(null);
    setMainView("picker");
    setSelectedPersona(null);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
  }

  function startNewChat() {
    setMainView("picker");
    setSelectedPersona(null);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
    setChatError("");
    setPersonaSearch("");
  }

  function selectPersona(persona: Persona) {
    setSelectedPersona(persona);
    setConversationId(undefined);
    setActiveConversationId(undefined);
    setMessages([]);
    setChatError("");
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
        personas.find((item) => item.id === creatorId) ??
        ({
          id: creatorId,
          name: getCreatorNameFromConversation(conversation),
        } satisfies Persona);

      setSelectedPersona(persona);
      setConversationId(conversation._id);
      setActiveConversationId(conversation._id);
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
      });
      setConversationId(result.conversationId);
      setActiveConversationId(result.conversationId);
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

  async function handleCreatePersona(event: React.FormEvent) {
    event.preventDefault();
    if (!channelUrl.trim()) return;
    setCreateLoading(true);
    try {
      await submitCreatorRequest(channelUrl.trim());
      setChannelUrl("");
      setCreateOpen(false);
      await refreshData();
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
        onLogout={handleLogout}
      />

      <main className="main-panel">
        {mainView === "picker" ? (
          <PersonaPicker
            personas={personas}
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
              onInputChange={setInput}
              onSend={handleSend}
              onToggleSources={(index) =>
                setShowSources(showSources === index ? null : index)
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
