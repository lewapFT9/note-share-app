import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import Link from "next/link";
import { db } from "../db/index";
import { notes } from "../db/schema";

type Props = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

export default async function Home(props: Props) {
  const searchParams = await props.searchParams;
  const currentTab = searchParams.tab || "notes"; 
  const selectedNoteId = searchParams.noteId;

  const { userId: currentUserId } = await auth();
  const user = await currentUser();
  const userRole = (user?.publicMetadata?.role as string) || "user";


  async function createNote(formData: FormData) {
    "use server";
    const { userId } = await auth();
    const user = await currentUser();
    if (!userId || !user) return;

    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const role = (user.publicMetadata?.role as string) || "user";
    
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const name = fullName || user.username || "Anonim";

    await db.insert(notes).values({
      title,
      content,
      userId,
      authorName: name,
      role: role,
    });

    revalidatePath("/");
    redirect("/?tab=notes"); 
  }

  async function deleteNote(formData: FormData) {
    "use server";
    const { userId } = await auth();
    const user = await currentUser();
    if (!userId) return;

    const noteId = parseInt(formData.get("noteId") as string);
    const role = (user?.publicMetadata?.role as string) || "user";

    if (role === "admin") {
      await db.delete(notes).where(eq(notes.id, noteId));
    } else {
      await db.delete(notes).where(
        and(eq(notes.id, noteId), eq(notes.userId, userId))
      );
    }

    revalidatePath("/");
    redirect("/?tab=notes"); 
  }


  async function updateProfile(formData: FormData) {
    "use server";
    const { userId } = await auth();
    if (!userId) return;

    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;

    const client = await clerkClient();
    await client.users.updateUser(userId, {
      firstName: firstName || "",
      lastName: lastName || "",
    });

    revalidatePath("/");
    redirect("/?tab=account"); 
  }


  async function deleteUserAccount(formData: FormData) {
    "use server";
    const me = await currentUser();
    if (me?.publicMetadata?.role !== "admin") return;

    const targetUserId = formData.get("targetUserId") as string;
    if (!targetUserId || targetUserId === me.id) return; 

    const client = await clerkClient();
    await client.users.deleteUser(targetUserId);
    revalidatePath("/");
  }

  async function toggleUserRole(formData: FormData) {
    "use server";
    const me = await currentUser();
    if (me?.publicMetadata?.role !== "admin") return;

    const targetUserId = formData.get("targetUserId") as string;
    if (!targetUserId || targetUserId === me.id) return; 

    const currentRole = formData.get("currentRole") as string;
    const newRole = currentRole === "admin" ? "user" : "admin";

    const client = await clerkClient();
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: { role: newRole },
    });
    revalidatePath("/");
  }

  const allNotes = currentUserId 
    ? await db.select().from(notes).orderBy(desc(notes.createdAt)) 
    : [];

  const activeNote = selectedNoteId ? allNotes.find(n => n.id === parseInt(selectedNoteId)) : null;

  let allUsers: any[] = [];
  if (userRole === "admin" && currentTab === "admin") {
    const client = await clerkClient();
    const userList = await client.users.getUserList();
    allUsers = userList.data || []; 
  }

  return (
    <main className="flex flex-col items-center min-h-screen p-4 md:p-10 bg-gray-100 text-black">
      <div className="w-full max-w-4xl bg-white p-6 rounded-xl shadow-lg flex flex-col gap-6">
        
        <div className="flex justify-between items-center border-b pb-4">
          <h1 className="text-2xl font-extrabold">Notatnik Cloud</h1>
          {currentUserId ? <UserButton /> : (
            <div className="bg-black text-white px-4 py-2 rounded-md font-semibold hover:bg-gray-800 cursor-pointer">
              <SignInButton mode="modal">Zaloguj się</SignInButton>
            </div>
          )}        
        </div>

        {currentUserId ? (
          <>
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
              <Link href="/?tab=notes" className={`px-4 py-2 rounded-md font-bold transition ${currentTab === "notes" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                📋 Notatki
              </Link>
              <Link href="/?tab=create" className={`px-4 py-2 rounded-md font-bold transition ${currentTab === "create" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                ✍️ Utwórz notatkę
              </Link>
              <Link href="/?tab=account" className={`px-4 py-2 rounded-md font-bold transition ${currentTab === "account" ? "bg-green-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                👤 Konto
              </Link>
              {userRole === "admin" && (
                <Link href="/?tab=admin" className={`px-4 py-2 rounded-md font-bold transition ${currentTab === "admin" ? "bg-red-600 text-white shadow-md" : "bg-red-50 text-red-700 hover:bg-red-100"}`}>
                  🛡️ Panel Admina
                </Link>
              )}
            </div>

            {currentTab === "create" && (
              <form action={createNote} className="flex flex-col gap-3 bg-blue-50 p-6 rounded-lg border border-blue-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <h2 className="font-bold text-blue-950 text-xl mb-2">Dodaj nową notatkę</h2>
                <input name="title" placeholder="Tytuł notatki..." required className="p-3 rounded-md border border-gray-300 text-black font-medium" />
                <textarea name="content" placeholder="Treść..." required className="p-3 rounded-md border border-gray-300 h-32 text-black font-medium"></textarea>
                <button type="submit" className="bg-blue-600 text-white py-3 rounded-md font-bold hover:bg-blue-700 shadow-sm transition">Dodaj do bazy</button>
              </form>
            )}

            {currentTab === "notes" && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                {allNotes.length === 0 && <p className="text-gray-500 text-center py-8">Brak notatek w bazie.</p>}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allNotes.map((note) => (
                    <div key={note.id} className="p-5 border border-yellow-300 rounded-lg bg-yellow-50 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                      <div>
                        <h3 className="font-extrabold text-xl mb-2 truncate">{note.title}</h3>
                        <div className="text-xs font-semibold text-gray-500 mb-4">
                          Autor: <span className="text-blue-700">{note.authorName || "Anonim"}</span>
                          <span className={`ml-2 uppercase px-2 py-0.5 rounded ${note.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                            {note.role}
                          </span>
                        </div>
                      </div>
                      <Link href={`/?tab=notes&noteId=${note.id}`} className="block text-center bg-yellow-400 text-yellow-900 font-bold py-2 rounded-md hover:bg-yellow-500 transition">
                        Otwórz notatkę
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentTab === "account" && (
              <form action={updateProfile} className="flex flex-col gap-4 bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <h2 className="font-bold text-gray-900 text-xl">Ustawienia Twojego profilu</h2>
                  <p className="text-sm text-gray-500">Zmień swoje imię i nazwisko. Zmiany będą widoczne dla wszystkich przy Twoich nowych notatkach.</p>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-gray-700">Imię</label>
                  <input 
                    name="firstName" 
                    defaultValue={user?.firstName || ""} 
                    placeholder="Twoje imię" 
                    required 
                    className="p-3 rounded-md border border-gray-300 text-black font-medium" 
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-gray-700">Nazwisko</label>
                  <input 
                    name="lastName" 
                    defaultValue={user?.lastName || ""} 
                    placeholder="Twoje nazwisko" 
                    className="p-3 rounded-md border border-gray-300 text-black font-medium" 
                  />
                </div>

                <button type="submit" className="bg-green-600 text-white py-3 mt-2 rounded-md font-bold hover:bg-green-700 shadow-sm transition">
                  Zapisz zmiany
                </button>
              </form>
            )}

            {activeNote && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white p-8 rounded-xl max-w-2xl w-full shadow-2xl relative animate-in zoom-in-95">
                  <Link href="/?tab=notes" className="absolute top-4 right-4 text-gray-400 hover:text-black font-bold text-xl px-2">
                    ✕
                  </Link>
                  
                  <h2 className="text-3xl font-extrabold mb-4 pr-10">{activeNote.title}</h2>
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 min-h-[150px] mb-6">
                    <p className="text-gray-900 font-medium whitespace-pre-wrap leading-relaxed">{activeNote.content}</p>
                  </div>
                  
                  <div className="flex justify-between items-center border-t pt-4">
                    <div className="text-sm font-semibold text-gray-600">
                      Dodane przez: <span className="text-black">{activeNote.authorName || "Anonim"}</span>
                    </div>
                    
                    {(currentUserId === activeNote.userId || userRole === "admin") && (
                      <form action={deleteNote}>
                        <input type="hidden" name="noteId" value={activeNote.id} />
                        <button type="submit" className="bg-red-600 text-white hover:bg-red-700 font-bold px-4 py-2 rounded-md transition shadow-sm">
                          🗑️ Usuń notatkę
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentTab === "admin" && userRole === "admin" && (
              <div className="flex flex-col gap-4 border-t-4 border-red-200 pt-4 animate-in fade-in slide-in-from-bottom-2">
                <h2 className="font-extrabold text-2xl text-red-800">🛡️ Zarządzanie Użytkownikami</h2>
                <p className="text-sm text-gray-600 mb-2">Poniżej znajduje się lista kont.</p>
                
                {allUsers.map((u) => {
                  const targetUserRole = (u.publicMetadata?.role as string) || "user";
                  const isMe = u.id === currentUserId; 
                  const userFullName = [u.firstName, u.lastName].filter(Boolean).join(" ");

                  return (
                    <div key={u.id} className={`flex flex-col md:flex-row justify-between items-center p-4 border rounded-lg gap-4 ${isMe ? 'bg-gray-50 border-gray-300' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex flex-col">
                        <span className="font-bold text-lg">{userFullName || u.username || "Brak nazwy"} {isMe && "(Ty)"}</span>
                        <span className="text-xs text-gray-500">ID: {u.id}</span>
                        <span className={`text-sm font-bold mt-1 ${targetUserRole === 'admin' ? 'text-red-600' : 'text-blue-600'}`}>
                          Rola: {targetUserRole.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        {!isMe && (
                          <>
                            <form action={toggleUserRole}>
                              <input type="hidden" name="targetUserId" value={u.id} />
                              <input type="hidden" name="currentRole" value={targetUserRole} />
                              <button type="submit" className={`text-white px-3 py-2 rounded-md font-bold text-sm transition ${targetUserRole === "admin" ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"}`}>
                                {targetUserRole === "admin" ? "Zabierz Admina" : "Daj Admina"}
                              </button>
                            </form>

                            <form action={deleteUserAccount}>
                              <input type="hidden" name="targetUserId" value={u.id} />
                              <button type="submit" className="bg-red-600 text-white px-3 py-2 rounded-md font-bold text-sm hover:bg-red-700 transition">
                                Usuń Konto
                              </button>
                            </form>
                          </>
                        )}
                        {isMe && (
                          <span className="text-sm text-gray-500 font-semibold px-4 py-2 border border-gray-200 rounded-md bg-white">
                            Konto Zabezpieczone
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="text-center font-bold py-10">Zaloguj się, aby zarządzać notatkami.</p>
        )}
      </div>
    </main>
  );
}