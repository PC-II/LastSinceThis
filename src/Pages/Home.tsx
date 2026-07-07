import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { Button, Card, TextInput } from "flowbite-react";
import { auth, db } from "../Utils/firebase";
import formatTimeSince from "../Utils/formatTimeSince";

// Firebase Firestore & Messaging Imports
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  increment,
  arrayUnion,
} from "firebase/firestore";

interface HistoryEntry {
  doneAt: Date;
  doneBy: string;
}

interface TrackItem {
  id: string;
  name: string;
  lastDoneBy: string;
  rawLastDoneAt?: Date;
  category: "shared" | "personal";
  userId?: string;
  count: number;
  history: HistoryEntry[];
}

export default () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [newItemName, setNewItemName] = useState("");
  const [activeTab, setActiveTab] = useState<"shared" | "personal">("shared");
  const [items, setItems] = useState<TrackItem[]>([]);
  const [itemToDelete, setItemToDelete] = useState<TrackItem | null>(null);
  const [itemToReset, setItemToReset] = useState<TrackItem | null>(null);
  const [tick, setTick] = useState(0);

  const [expandedHistory, setExpandedHistory] = useState<
    Record<string, boolean>
  >({});

  const toggleHistory = (id: string) => {
    setExpandedHistory((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Heartbeat interval to force-refresh timers live every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Easter Egg State
  const [, setEasterEggCount] = useState(0);
  const [showSecretMessage, setShowSecretMessage] = useState(false);

  /* Easter Egg Trigger */
  const handleEasterEggClick = () => {
    if (showSecretMessage) return;

    setEasterEggCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= 7) {
        setShowSecretMessage(true);
        return 0;
      }
      return nextCount;
    });
  };

  /* Auth State & Firestore Realtime Subscription */
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/");
        setLoading(false);
      } else {
        setUser(currentUser);

        const q = query(
          collection(db, "trackers"),
          orderBy("updatedAt", "desc"),
        );

        const unsubscribeFirestore = onSnapshot(
          q,
          (snapshot) => {
            const loadedItems: TrackItem[] = [];
            snapshot.forEach((document) => {
              const data = document.data();

              let rawDate: Date | undefined = undefined;
              if (data.updatedAt instanceof Timestamp) {
                rawDate = data.updatedAt.toDate();
              }

              // Parse history array elements safely converting Timestamps to Dates
              const historyLog: HistoryEntry[] = Array.isArray(data.history)
                ? data.history
                    .map((entry: any) => ({
                      doneBy: entry.doneBy || "Someone",
                      doneAt:
                        entry.doneAt instanceof Timestamp
                          ? entry.doneAt.toDate()
                          : new Date(entry.doneAt),
                    }))
                    .sort(
                      (a: HistoryEntry, b: HistoryEntry) =>
                        b.doneAt.getTime() - a.doneAt.getTime(),
                    ) // Newest first
                : [];

              loadedItems.push({
                id: document.id,
                name: data.name,
                lastDoneBy: data.lastDoneBy || "Never",
                rawLastDoneAt: rawDate,
                category: data.category,
                userId: data.userId,
                count: data.count || 0,
                history: historyLog,
              });
            });

            setItems(loadedItems);
            setLoading(false);
          },
          (error) => {
            console.error("Firestore listening error: ", error);
            setLoading(false);
          },
        );

        return () => unsubscribeFirestore();
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  /* Handle Action Updates */
  const handleLogAction = async (id: string) => {
    const docRef = doc(db, "trackers", id);
    const actorName = user?.displayName?.split(" ")[0] || "You";
    try {
      await updateDoc(docRef, {
        lastDoneBy: actorName,
        updatedAt: serverTimestamp(),
        count: increment(1),
        history: arrayUnion({
          doneBy: actorName,
          doneAt: new Date(),
        }),
      });
    } catch (error) {
      console.error("Error logging completion:", error);
    }
  };

  /* Handle Reset Counter and History Confirmation */
  const handleConfirmReset = async () => {
    if (!itemToReset) return;
    const docRef = doc(db, "trackers", itemToReset.id);
    try {
      await updateDoc(docRef, {
        count: 0,
        history: [],
      });
      setItemToReset(null);
    } catch (error) {
      console.error("Error resetting counter and history:", error);
    }
  };

  /* Handle Add New Item */
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      const targetReminderDate = new Date();
      targetReminderDate.setHours(targetReminderDate.getHours() + 24);

      await addDoc(collection(db, "trackers"), {
        name: newItemName.trim(),
        lastDoneBy: "Never",
        category: activeTab,
        userId: user?.uid,
        updatedAt: serverTimestamp(),
        reminderAt: Timestamp.fromDate(targetReminderDate),
        reminderNotified: false,
        count: 0,
        history: [], // Initializing blank array schema layout
      });

      setNewItemName("");
    } catch (error) {
      console.error("Error saving item to database:", error);
    }
  };

  /* Handle Delete Item */
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, "trackers", itemToDelete.id));
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 font-medium text-stone-600">
        Loading your routines...
      </div>
    );
  }

  const filteredItems = items.filter((item) => {
    if (activeTab === "shared") {
      return item.category === "shared";
    } else {
      return item.category === "personal" && item.userId === user?.uid;
    }
  });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-amber-50 pb-24 font-sans text-stone-800">
      <style>{`
        @keyframes floatHeart {
          0% { transform: translateY(100vh) scale(0.5); opacity: 0; }
          50% { opacity: 0.8; }
          100% { transform: translateY(-20vh) scale(1.2) rotate(20deg); opacity: 0; }
        }
        @keyframes ribbonFall {
          0% { transform: translateY(-10%) rotate(0deg); }
          100% { transform: translateY(110%) rotate(360deg); }
        }
        @keyframes textPop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        .animate-heart-1 { animation: floatHeart 4s infinite linear; }
        .animate-heart-2 { animation: floatHeart 5s infinite ease-in-out; animation-delay: 1.5s; }
        .animate-heart-3 { animation: floatHeart 3.5s infinite ease-out; animation-delay: 0.5s; }
        .animate-ribbon-1 { animation: ribbonFall 6s infinite linear; }
        .animate-ribbon-2 { animation: ribbonFall 8s infinite linear; animation-delay: 2s; }
        .animate-text-pop { animation: textPop 3s infinite ease-in-out; }
      `}</style>

      {/* Background Blobs */}
      <div className="animate-blob absolute top-0 -left-10 h-96 w-96 rounded-full bg-orange-400 opacity-10 mix-blend-multiply blur-2xl filter"></div>
      <div className="animate-blob animation-delay-2000 absolute top-20 -right-10 h-96 w-96 rounded-full bg-amber-200 opacity-20 mix-blend-multiply blur-2xl filter"></div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-orange-100 bg-white/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-orange-100 p-2 text-orange-600">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-stone-800">
              Last Since <span className="text-orange-500">This...</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm font-medium text-stone-600 sm:inline">
              Hi,{" "}
              <span className="text-orange-600">
                {user?.displayName?.split(" ")[0] || "there"}
              </span>
              ! 👋
            </span>
            <Button
              size="xs"
              color="light"
              onClick={handleSignOut}
              className="cursor-pointer border-stone-200 text-stone-600 hover:bg-orange-50"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Container */}
      <main className="relative z-10 mx-auto mt-8 max-w-2xl px-4">
        {/* Input Form */}
        <Card className="mb-6 rounded-2xl border border-orange-200/50 bg-white/70 shadow-md backdrop-blur-md">
          <form
            onSubmit={handleAddItem}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="grow">
              <TextInput
                type="text"
                placeholder={`Add a new ${activeTab === "shared" ? "shared responsibility" : "personal goal"}...`}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                required
                className="w-full"
                theme={{
                  field: {
                    input: {
                      colors: {
                        gray: "border-orange-200 bg-white text-stone-800 focus:border-orange-400 focus:ring-orange-400/50",
                      },
                    },
                  },
                }}
              />
            </div>
            <Button
              type="submit"
              className="cursor-pointer bg-orange-500 font-semibold text-white focus:ring-4 focus:ring-orange-300 enabled:hover:bg-orange-600"
            >
              + Add Tracker
            </Button>
          </form>
        </Card>

        {/* Dashboard Box */}
        <Card className="rounded-2xl border border-orange-200/50 bg-white/70 p-0 shadow-xl backdrop-blur-md">
          <div className="p-6">
            {/* Headers */}
            <div className="flex border-b border-stone-200/60">
              <button
                type="button"
                onClick={() => setActiveTab("shared")}
                className={`grow pb-3 text-sm font-semibold transition-all duration-200 outline-none ${
                  activeTab === "shared"
                    ? "border-b-2 border-orange-500 text-orange-600"
                    : "cursor-pointer text-stone-400 hover:text-stone-600"
                }`}
              >
                Shared Responsibilities
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("personal")}
                className={`grow pb-3 text-sm font-semibold transition-all duration-200 outline-none ${
                  activeTab === "personal"
                    ? "border-b-2 border-orange-500 text-orange-600"
                    : "cursor-pointer text-stone-400 hover:text-stone-600"
                }`}
              >
                My Personal Lists
              </button>
            </div>

            {/* List */}
            <div className="mt-6 space-y-4">
              {filteredItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400 italic">
                  No items listed here yet. Type something above to begin!
                </p>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col rounded-xl border border-orange-100 bg-white/90 p-4 shadow-sm transition-all duration-200 hover:border-orange-200 hover:bg-orange-50/40"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="max-w-full sm:max-w-[60%]">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-stone-800">
                            {item.name}
                          </h3>
                          {/* History Toggle Trigger via Count Badge */}
                          <button
                            type="button"
                            onClick={() => toggleHistory(item.id)}
                            disabled={item.history.length === 0}
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-150 ${
                              item.history.length > 0
                                ? "cursor-pointer bg-orange-100 text-orange-800 hover:bg-orange-200"
                                : "cursor-not-allowed bg-stone-100 text-stone-400"
                            }`}
                            title={
                              item.history.length > 0
                                ? "Click to view history logs"
                                : "No history logs found"
                            }
                          >
                            {item.count} {item.count === 1 ? "time" : "times"}
                            {item.history.length > 0 && (
                              <svg
                                className={`ml-1 h-3 w-3 transform transition-transform duration-200 ${
                                  expandedHistory[item.id] ? "rotate-180" : ""
                                }`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs text-stone-500">
                          Last done:{" "}
                          <span className="font-medium text-stone-700">
                            {item.rawLastDoneAt
                              ? `${formatTimeSince(item.rawLastDoneAt)}${tick * 0 === 0 ? "" : ""}`
                              : "Just now"}
                          </span>
                          {item.category === "shared" && (
                            <>
                              {" "}
                              • by{" "}
                              <span className="font-medium text-orange-600">
                                {item.lastDoneBy}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          size="sm"
                          onClick={() => handleLogAction(item.id)}
                          className="cursor-pointer border border-orange-200 bg-white text-stone-700 shadow-xs transition-all duration-200 hover:bg-orange-500 hover:text-white focus:ring-4 focus:ring-orange-300/40"
                        >
                          Mark
                        </Button>

                        <Button
                          size="sm"
                          color="light"
                          onClick={() => setItemToReset(item)}
                          disabled={item.count === 0}
                          className="cursor-pointer border border-stone-200 bg-white text-stone-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          Reset
                        </Button>

                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="group cursor-pointer rounded-lg p-2 text-stone-400 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
                        >
                          <svg
                            className="h-5 w-5 opacity-70 group-hover:opacity-100"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 6. Dynamic Expandable Dropdown History Area */}
                    {expandedHistory[item.id] && item.history.length > 0 && (
                      <div className="animate-in fade-in slide-in-from-top-2 mt-3 border-t border-stone-100 pt-3 duration-200">
                        <div className="custom-scrollbar max-h-40 overflow-y-auto rounded-lg bg-stone-50/80 p-3 text-xs">
                          <p className="mb-2 text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
                            Completions Log History
                          </p>
                          <ul className="space-y-1.5">
                            {item.history.map((log, index) => (
                              <li
                                key={index}
                                className="flex items-center justify-between text-stone-600"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-orange-400"></span>
                                  <span>
                                    Completed{" "}
                                    {item.category === "shared" ? `by ` : ""}
                                    <span className="font-medium text-orange-600">
                                      {item.category === "shared"
                                        ? log.doneBy
                                        : "You"}
                                    </span>
                                  </span>
                                </div>
                                <span className="font-medium text-stone-500">
                                  {log.doneAt.toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Cozy Footer (The Easter Egg Trigger!) */}
            <div className="mt-8 border-t border-stone-200/60 pt-4 text-center">
              <p
                onClick={handleEasterEggClick}
                className="cursor-pointer text-xs text-stone-400 italic transition-colors duration-200 select-none hover:text-stone-500 active:text-orange-400"
              >
                "Teamwork makes the dream work!"
              </p>
            </div>
          </div>
        </Card>

        {/* 💖 EXTRAVAGANT EASTER EGG SECTION 💖 */}
        {showSecretMessage && (
          <div className="animate-in fade-in slide-in-from-bottom-8 relative mt-8 overflow-hidden rounded-2xl border-2 border-pink-200 bg-linear-to-br from-pink-50 via-rose-50 to-orange-50 p-8 text-center shadow-2xl transition-all duration-500">
            <button
              onClick={() => setShowSecretMessage(false)}
              className="absolute top-3 right-3 cursor-pointer text-sm font-bold text-pink-400 hover:text-pink-600"
            >
              ✕ Close
            </button>

            <div className="animate-ribbon-1 absolute top-0 left-10 h-16 w-2 rounded-full bg-pink-400/40"></div>
            <div className="animate-ribbon-2 absolute top-0 right-20 h-24 w-3 rounded-full bg-orange-300/30"></div>
            <div className="animate-ribbon-2 absolute top-10 left-1/3 h-20 w-2 rounded-full bg-rose-400/30"></div>

            <div className="animate-heart-1 absolute bottom-0 left-6 text-xl opacity-40">
              💖
            </div>
            <div className="animate-heart-2 absolute right-12 bottom-0 text-2xl opacity-50">
              💝
            </div>
            <div className="animate-heart-3 absolute bottom-0 left-1/2 text-lg opacity-40">
              ❤️
            </div>

            <div className="animate-text-pop py-6">
              <h1 className="bg-linear-to-r from-pink-600 via-rose-500 to-orange-500 bg-clip-text text-4xl font-black tracking-wider text-transparent drop-shadow-[0_2px_10px_rgba(244,63,94,0.15)] sm:text-5xl">
                I LOVE YOU MON COEUR!
              </h1>
              <p className="mt-4 text-xs font-semibold tracking-widest text-rose-400 uppercase">
                Forever & Always • Click quote to close
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Reset Confirmation Modal */}
      {itemToReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setItemToReset(null)}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs"
          />
          <Card className="z-10 w-full max-w-sm rounded-2xl border border-orange-100 bg-white shadow-2xl">
            <div className="p-2 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-stone-800">
                Reset Counter & History?
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Are you sure you want to clear all history and completions for{" "}
                <span className="font-semibold text-stone-700">
                  "{itemToReset.name}"
                </span>
                ? This cannot be undone.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button
                  color="light"
                  onClick={() => setItemToReset(null)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  color="failure"
                  onClick={handleConfirmReset}
                  className="cursor-pointer bg-red-500 hover:bg-red-600"
                >
                  Yes, Reset
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setItemToDelete(null)}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs"
          />
          <Card className="z-10 w-full max-w-sm rounded-2xl border border-orange-100 bg-white shadow-2xl">
            <div className="p-2 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-stone-800">
                Remove Tracker?
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Are you sure you want to stop tracking{" "}
                <span className="font-semibold text-stone-700">
                  "{itemToDelete.name}"
                </span>
                ?
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button
                  color="light"
                  onClick={() => setItemToDelete(null)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  color="failure"
                  onClick={handleConfirmDelete}
                  className="cursor-pointer bg-red-500 hover:bg-red-600"
                >
                  Yes, Delete
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
