import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  deleteDoc,
  getDocs,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { getRandomAvatar } from '../data/avatars'

const AuthContext = createContext(null)

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

async function ensureProfile(firebaseUser, name) {
  const existing = await getProfile(firebaseUser.uid)
  if (existing) return existing
  const avatar = getRandomAvatar()
  const profile = {
    name: name || firebaseUser.displayName || 'User',
    email: firebaseUser.email,
    avatar: avatar.image,
    avatarName: avatar.name,
    plan: 'free',
    joinDate: new Date().toISOString().split('T')[0],
    favorites: [],
    watchlist: [],
    continueWatching: [],
    watchMinutes: 0,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'users', firebaseUser.uid), profile)
  return profile
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [audioMode, setAudioMode] = useState('sub')
  const [notifications, setNotifications] = useState([])
  const userRef = useRef(null)
  userRef.current = user

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!user) { setNotifications([]); return }
    const q = query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user?.uid])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const profile = await getProfile(fbUser.uid)
        if (profile) {
          setUser({ uid: fbUser.uid, ...profile })
        } else {
          const profile2 = await ensureProfile(fbUser)
          setUser({ uid: fbUser.uid, ...profile2 })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const login = useCallback(async (email, password) => {
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      setLoading(false)
      return true
    } catch (err) {
      setLoading(false)
      throw err
    }
  }, [])

  const signup = useCallback(async (name, email, password) => {
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      const profile = await ensureProfile(cred.user, name)
      setUser({ uid: cred.user.uid, ...profile })
      await addDoc(collection(db, 'users', cred.user.uid, 'notifications'), {
        title: 'Welcome to Kaisen X Anime!',
        body: `Hey ${name || 'there'}! Your account is set up. Start exploring anime, build your watchlist, and track your favorites.`,
        type: 'welcome',
        link: '/browse',
        read: false,
        createdAt: serverTimestamp(),
      })
      setLoading(false)
      return true
    } catch (err) {
      setLoading(false)
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
    setUser(null)
  }, [])

  const resetPassword = useCallback((email) => {
    return sendPasswordResetEmail(auth, email)
  }, [])

  const updateProfileField = useCallback(async (fields) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid), fields)
    setUser((prev) => ({ ...prev, ...fields }))
  }, [user])

  const toggleFavorite = useCallback(async (animeId) => {
    if (!user) return
    const isFav = user.favorites.includes(animeId)
    await updateDoc(doc(db, 'users', user.uid), {
      favorites: isFav ? arrayRemove(animeId) : arrayUnion(animeId),
    })
    setUser((prev) => ({
      ...prev,
      favorites: isFav
        ? prev.favorites.filter((id) => id !== animeId)
        : [...prev.favorites, animeId],
    }))
  }, [user])

  const toggleWatchlist = useCallback(async (animeId) => {
    if (!user) return
    const inList = user.watchlist.includes(animeId)
    await updateDoc(doc(db, 'users', user.uid), {
      watchlist: inList ? arrayRemove(animeId) : arrayUnion(animeId),
    })
    setUser((prev) => ({
      ...prev,
      watchlist: inList
        ? prev.watchlist.filter((id) => id !== animeId)
        : [...prev.watchlist, animeId],
    }))
  }, [user])

  const getLocalContinueWatching = () => {
    try { return JSON.parse(localStorage.getItem('cw_guest') || '[]') } catch { return [] }
  }
  const saveLocalContinueWatching = (list) => {
    localStorage.setItem('cw_guest', JSON.stringify(list))
  }

  const addContinueWatching = useCallback(async (animeId, episode, title, coverImage, totalEpisodes, audioMode) => {
    const u = userRef.current
    const list = u ? (u.continueWatching || []) : getLocalContinueWatching()
    const prev = list.find(
      (e) => e.animeId === String(animeId) && e.episode === Number(episode)
    )
    const now = Date.now()
    const entry = {
      animeId: String(animeId),
      episode: Number(episode),
      title: title || prev?.title || '',
      coverImage: coverImage || prev?.coverImage || '',
      totalEpisodes: Number(totalEpisodes) || prev?.totalEpisodes || 0,
      audioMode: audioMode || prev?.audioMode || 'sub',
      currentTime: prev?.currentTime || 0,
      duration: prev?.duration || 0,
      progressPercent: prev?.progressPercent || 0,
      updatedAt: prev?.updatedAt || now,
    }
    if (!u) {
      const filtered = getLocalContinueWatching().filter(
        (e) => e.animeId !== String(animeId) || e.episode !== Number(episode)
      )
      saveLocalContinueWatching([entry, ...filtered].slice(0, 10))
      return
    }
    const existing = list.filter(
      (e) => e.animeId !== String(animeId) || e.episode !== Number(episode)
    )
    const updated = [entry, ...existing].slice(0, 20)
    await updateDoc(doc(db, 'users', u.uid), { continueWatching: updated })
    setUser((prev) => ({ ...prev, continueWatching: updated }))
  }, [])

  const updateContinueWatchingProgress = useCallback(async (animeId, episode, currentTime, duration) => {
    const u = userRef.current
    const progressPercent = duration > 0 ? Math.min(Math.round((currentTime / duration) * 100), 100) : 0
    if (!u) {
      const list = getLocalContinueWatching().map((e) => {
        if (e.animeId === String(animeId) && e.episode === Number(episode)) {
          return { ...e, currentTime, duration, progressPercent, updatedAt: Date.now() }
        }
        return e
      })
      saveLocalContinueWatching(list.filter((e) => e.duration <= 0 || e.currentTime < e.duration * 0.95))
      return
    }
    const list = (u.continueWatching || []).map((e) => {
      if (e.animeId === String(animeId) && e.episode === Number(episode)) {
        return { ...e, currentTime, duration, progressPercent, updatedAt: Date.now() }
      }
      return e
    })
    const filtered = list
      .filter((e) => e.duration <= 0 || e.currentTime < e.duration * 0.95)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    await updateDoc(doc(db, 'users', u.uid), { continueWatching: filtered })
    setUser((prev) => ({ ...prev, continueWatching: filtered }))
  }, [])

  const removeContinueWatching = useCallback(async (animeId, episode) => {
    const u = userRef.current
    if (!u) {
      const list = getLocalContinueWatching().filter(
        (e) => e.animeId !== String(animeId) || (episode !== undefined && e.episode !== Number(episode))
      )
      saveLocalContinueWatching(list)
      return
    }
    let updated
    if (episode !== undefined) {
      updated = (u.continueWatching || []).filter(
        (e) => e.animeId !== String(animeId) || e.episode !== Number(episode)
      )
    } else {
      updated = (u.continueWatching || []).filter((e) => e.animeId !== String(animeId))
    }
    await updateDoc(doc(db, 'users', u.uid), { continueWatching: updated })
    setUser((prev) => ({ ...prev, continueWatching: updated }))
  }, [])

  const addWatchMinutes = useCallback(async (minutes) => {
    if (!user) return
    const mins = Math.round(minutes)
    if (mins <= 0) return
    await updateDoc(doc(db, 'users', user.uid), {
      watchMinutes: (user.watchMinutes || 0) + mins,
    })
    setUser((prev) => ({ ...prev, watchMinutes: (prev.watchMinutes || 0) + mins }))
  }, [user])

  const setAvatar = useCallback((image, name) => {
    if (!user) return
    updateDoc(doc(db, 'users', user.uid), { avatar: image, avatarName: name })
    setUser((prev) => ({ ...prev, avatar: image, avatarName: name }))
  }, [user])

  const addNotification = useCallback(async (title, body, type, link) => {
    if (!user) return
    await addDoc(collection(db, 'users', user.uid, 'notifications'), {
      title,
      body,
      type: type || 'info',
      link: link || null,
      read: false,
      createdAt: serverTimestamp(),
    })
  }, [user])

  const markRead = useCallback(async (notifId) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'notifications', notifId), { read: true })
  }, [user])

  const markAllRead = useCallback(async () => {
    if (!user) return
    const snap = await getDocs(query(collection(db, 'users', user.uid, 'notifications')))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => { batch.update(d.ref, { read: true }) })
    await batch.commit()
  }, [user])

  const clearAll = useCallback(async () => {
    if (!user) return
    const snap = await getDocs(query(collection(db, 'users', user.uid, 'notifications')))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => { batch.delete(d.ref) })
    await batch.commit()
  }, [user])

  const sendNotification = useCallback(async (title, body, type, link) => {
    if (!user) return
    await addNotification(title, body, type, link)
  }, [user, addNotification])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        resetPassword,
        toggleFavorite,
        toggleWatchlist,
        addContinueWatching,
        updateContinueWatchingProgress,
        removeContinueWatching,
        addWatchMinutes,
        updateProfileField,
        setAvatar,
        audioMode,
        setAudioMode,
        notifications,
        unreadCount,
        addNotification,
        markRead,
        markAllRead,
        clearAll,
        sendNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
