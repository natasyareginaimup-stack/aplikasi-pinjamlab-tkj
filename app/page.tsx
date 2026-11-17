'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Activity, ArrowDownToLine, ArrowRight, Bell, Box, Check, ChevronDown, CircleHelp, ClipboardList, Command, DoorOpen, LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Truck, Users, Wrench, X } from 'lucide-react'

type Tool = { id: string; nama: string; kategori: string; stok: number; kondisi: string }
type Loan = { id: string; alat_id: string; user_id: string; nama_peminjam: string; kelas: string; tanggal_pinjam: string; tanggal_kembali: string; status: 'Dipinjam' | 'Dikembalikan'; alat?: { nama: string } | null }
type Profile = { display_name: string; role: 'admin' | 'user' }
type Section = 'Ringkasan' | 'Daftar alat' | 'Peminjaman' | 'Laporan' | 'Kelola alat'

const supabase = createClient()
const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
const today = new Date().toISOString().slice(0, 10)

export default function PinjamLab() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [section, setSection] = useState<Section>('Ringkasan')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authBusy, setAuthBusy] = useState(false)
  const [modal, setModal] = useState<'loan' | 'tool' | null>(null)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  const loadData = useCallback(async (activeUser: User) => {
    const [profileResult, toolResult, loanResult] = await Promise.all([
      supabase.from('profiles').select('display_name, role').eq('id', activeUser.id).single(),
      supabase.from('alat').select('id,nama,kategori,stok,kondisi').order('nama'),
      supabase.from('peminjaman').select('id,alat_id,user_id,nama_peminjam,kelas,tanggal_pinjam,tanggal_kembali,status,alat(nama)').order('created_at', { ascending: false }),
    ])
    if (profileResult.error) setMessage(`Profil belum dapat dibaca: ${profileResult.error.message}`)
    if (toolResult.error) setMessage(`Gagal memuat alat: ${toolResult.error.message}`)
    if (loanResult.error) setMessage(`Gagal memuat peminjaman: ${loanResult.error.message}`)
    if (profileResult.data) setProfile(profileResult.data as Profile)
    if (toolResult.data) setTools(toolResult.data as Tool[])
    if (loanResult.data) setLoans(loanResult.data as unknown as Loan[])
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      setUser(data.user)
      if (data.user) void loadData(data.user)
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      if (session?.user) { setLoading(true); void loadData(session.user) }
      else { setProfile(null); setTools([]); setLoans([]); setLoading(false) }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [loadData])

  const admin = profile?.role === 'admin'
  const activeLoans = useMemo(() => loans.filter((loan) => loan.status === 'Dipinjam'), [loans])
  const borrowedByTool = useMemo(() => activeLoans.reduce<Record<string, number>>((acc, loan) => { acc[loan.alat_id] = (acc[loan.alat_id] ?? 0) + 1; return acc }, {}), [activeLoans])
  const totalStock = tools.reduce((sum, tool) => sum + tool.stok, 0)
  const available = Math.max(0, totalStock - activeLoans.length)
  const filteredTools = tools.filter((tool) => `${tool.nama} ${tool.kategori}`.toLowerCase().includes(search.toLowerCase()))
  const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
    { label: 'Ringkasan', icon: LayoutDashboard }, { label: 'Daftar alat', icon: Package }, { label: 'Peminjaman', icon: ClipboardList },
    ...(admin ? [{ label: 'Kelola alat' as Section, icon: Settings2 }] : []), { label: 'Laporan', icon: Activity },
  ]

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthBusy(true); setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    if (authMode === 'register') {
      const displayName = String(form.get('name')).trim()
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`, data: { display_name: displayName } } })
      setMessage(error ? (error.message.includes('already registered') ? 'Email atau kata sandi tidak valid.' : error.message) : 'Pendaftaran berhasil. Periksa email untuk konfirmasi sebelum masuk.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setMessage(error ? (error.message.toLowerCase().includes('confirm') ? 'Konfirmasi email dari kotak masuk sebelum masuk.' : 'Email atau kata sandi tidak valid.') : '')
    }
    setAuthBusy(false)
  }

  async function saveTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!admin) return
    const form = new FormData(event.currentTarget)
    const record = { nama: String(form.get('nama')).trim(), kategori: String(form.get('kategori')), stok: Number(form.get('stok')), kondisi: String(form.get('kondisi')) }
    const result = editingTool ? await supabase.from('alat').update(record).eq('id', editingTool.id) : await supabase.from('alat').insert(record)
    if (result.error) { setMessage(result.error.message); return }
    setModal(null); setEditingTool(null); await loadData(user!)
  }

  async function saveLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    const form = new FormData(event.currentTarget)
    const alatId = String(form.get('alat_id'))
    if ((borrowedByTool[alatId] ?? 0) >= (tools.find((tool) => tool.id === alatId)?.stok ?? 0)) { setMessage('Stok alat ini sedang habis dipinjam.'); return }
    const { error } = await supabase.from('peminjaman').insert({ alat_id: alatId, user_id: user.id, nama_peminjam: String(form.get('nama_peminjam')).trim(), kelas: String(form.get('kelas')).trim(), tanggal_pinjam: String(form.get('tanggal_pinjam')), tanggal_kembali: String(form.get('tanggal_kembali')), status: 'Dipinjam' })
    if (error) { setMessage(error.message); return }
    setModal(null); await loadData(user)
  }

  async function removeTool(id: string) {
    if (!admin || !window.confirm('Hapus alat ini?')) return
    const { error } = await supabase.from('alat').delete().eq('id', id)
    if (error) setMessage(error.message); else if (user) await loadData(user)
  }
  async function changeLoanStatus(loan: Loan, status: Loan['status']) {
    const { error } = await supabase.from('peminjaman').update({ status }).eq('id', loan.id)
    if (error) setMessage(error.message); else if (user) await loadData(user)
  }
  async function deleteLoan(loan: Loan) {
    if (!window.confirm('Hapus catatan peminjaman ini?')) return
    const { error } = await supabase.from('peminjaman').delete().eq('id', loan.id)
    if (error) setMessage(error.message); else if (user) await loadData(user)
  }
  function exportReport() {
    const rows = [['Alat','Peminjam','Kelas','Tanggal pinjam','Tanggal kembali','Status'], ...loans.map((loan) => [loan.alat?.nama ?? '', loan.nama_peminjam, loan.kelas, loan.tanggal_pinjam, loan.tanggal_kembali, loan.status])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"','""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); link.download = `laporan-pinjamlab-${today}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={30} /><span>Memuat PinjamLab...</span></div>
  if (!user) return <main className="auth-shell"><section className="auth-visual"><div className="brand brand-light"><span className="brand-mark"><Command size={19}/></span><span>Pinjam<span className="brand-accent">Lab</span></span></div><div className="auth-art"><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/><div className="art-device"><Wrench size={54}/><span className="device-dot"/></div><span className="art-chip chip-one"><Package size={17}/> 12 alat tersedia</span><span className="art-chip chip-two"><ShieldCheck size={17}/> Lab terkelola</span></div><div className="auth-pitch"><p className="eyebrow">LAB TKJ, LEBIH TERATUR</p><h1>Alat siap.<br/>Belajar lancar.</h1><p>Kelola peminjaman peralatan lab dengan praktis, dari kelas sampai kembali.</p></div><div className="auth-foot">Sistem peminjaman alat laboratorium TKJ</div></section><section className="auth-form-side"><div className="auth-mobile-brand brand"><span className="brand-mark"><Command size={19}/></span><span>Pinjam<span className="brand-accent">Lab</span></span></div><form className="auth-form" onSubmit={handleAuth}><span className="welcome-icon"><Sparkles size={19}/></span><p className="eyebrow">SELAMAT DATANG DI PINJAMLAB</p><h2>{authMode === 'login' ? 'Masuk ke akunmu' : 'Buat akun siswa'}</h2><p className="auth-sub">{authMode === 'login' ? 'Masuk untuk melihat alat dan mengelola peminjaman.' : 'Daftar sebagai siswa untuk mulai meminjam alat lab.'}</p>{authMode === 'register' && <label>Nama lengkap<input name="name" placeholder="Nama sesuai identitas" autoComplete="name" required/></label>}<label>Email<input name="email" type="email" placeholder="nama@sekolah.sch.id" autoComplete="email" required/></label><label>Kata sandi<input name="password" type="password" placeholder="Minimal 6 karakter" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={6} required/></label>{message && <p className="form-message" role="status">{message}</p>}<button className="primary-btn auth-submit" disabled={authBusy}>{authBusy ? 'Memproses...' : authMode === 'login' ? 'Masuk' : 'Daftar sebagai siswa'}<ArrowRight size={17}/></button><p className="auth-switch">{authMode === 'login' ? 'Belum punya akun?' : 'Sudah terdaftar?'} <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setMessage('') }}>{authMode === 'login' ? 'Daftar sekarang' : 'Masuk'}</button></p><p className="auth-note"><ShieldCheck size={14}/> Akun baru otomatis terdaftar sebagai siswa.</p></form><div className="auth-bottom">© 2026 PinjamLab TKJ <span><CircleHelp size={14}/> Butuh bantuan?</span></div></section></main>

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><a className="brand" href="#home"><span className="brand-mark"><Command size={19}/></span><span>Pinjam<span className="brand-accent">Lab</span></span></a><div className="school-label"><span className="school-avatar">TK</span><span><strong>Laboratorium TKJ</strong><small>SMK Teknologi</small></span><ChevronDown size={15}/></div><div className="nav-caption">MENU UTAMA</div><nav className="side-nav" aria-label="Navigasi utama">{navItems.map(({label, icon: Icon}) => <button key={label} className={`nav-item ${section === label ? 'nav-active' : ''}`} onClick={() => { setSection(label); setMobileNav(false) }}><Icon size={18}/><span>{label}</span>{label === 'Peminjaman' && activeLoans.length > 0 && <span className="nav-count">{activeLoans.length}</span>}</button>)}</nav><div className="sidebar-spacer"/><div className="help-card"><span className="help-icon"><CircleHelp size={17}/></span><strong>Perlu bantuan?</strong><p>Tanyakan kepada petugas lab untuk bantuan.</p><a href="mailto:lab@sekolah.sch.id">Hubungi petugas <ArrowRight size={13}/></a></div><div className="sidebar-user"><span className="user-avatar">{(profile?.display_name || user.email || 'S').slice(0,1).toUpperCase()}</span><span className="user-details"><strong>{profile?.display_name || user.email?.split('@')[0]}</strong><small>{admin ? 'Administrator' : 'Siswa'}</small></span><button className="icon-button user-logout" aria-label="Keluar" onClick={() => supabase.auth.signOut()}><LogOut size={17}/></button></div></aside><main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileNav(!mobileNav)}><Menu size={20}/></button><div className="breadcrumb">PinjamLab <span>/</span> <strong>{section}</strong></div><div className="topbar-actions"><span className="date-label">{new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><button className="icon-button notification" aria-label="Notifikasi"><Bell size={18}/><i/></button><span className="top-avatar">{(profile?.display_name || user.email || 'S').slice(0,1).toUpperCase()}</span></div></header><div className="content-wrap"><div className="page-heading"><div><p className="eyebrow">{admin ? 'PANEL ADMINISTRATOR' : 'RUANG BELAJAR DIGITAL'}</p><h1>{section === 'Ringkasan' ? `Halo, ${(profile?.display_name || 'Teman').split(' ')[0]}!` : section}</h1><p className="heading-sub">{section === 'Ringkasan' ? 'Siap praktik hari ini? Cek kebutuhan alat lab kamu.' : section === 'Daftar alat' ? 'Temukan alat yang kamu butuhkan untuk praktik.' : section === 'Peminjaman' ? 'Pantau status dan riwayat peminjaman alat lab.' : section === 'Laporan' ? 'Rekap semua peminjaman alat laboratorium.' : 'Tambah dan perbarui inventaris laboratorium.'}</p></div><div className="heading-buttons">{section === 'Ringkasan' && <button className="secondary-btn" onClick={() => setSection('Daftar alat')}><Search size={16}/> Cari alat</button>}{(section === 'Ringkasan' || section === 'Daftar alat') && <button className="primary-btn" onClick={() => { setModal('loan'); setMessage('') }}><Plus size={17}/> Pinjam alat</button>}{admin && section === 'Kelola alat' && <button className="primary-btn" onClick={() => { setEditingTool(null); setModal('tool') }}><Plus size={17}/> Tambah alat</button>}{section === 'Laporan' && <button className="primary-btn" onClick={exportReport}><ArrowDownToLine size={17}/> Export CSV</button>}</div></div>
    {message && <div className="notice" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Tutup pesan"><X size={15}/></button></div>}
    {section === 'Ringkasan' && <><div className="stats-grid"><StatCard icon={Box} label="Total alat" value={totalStock} detail={`${tools.length} jenis peralatan`} tone="blue"/><StatCard icon={Truck} label="Sedang dipinjam" value={activeLoans.length} detail="alat belum dikembalikan" tone="amber"/><StatCard icon={Check} label="Tersedia" value={available} detail="siap untuk dipinjam" tone="green"/><div className="stat-card insight-card"><div className="insight-top"><span className="insight-icon"><Sparkles size={17}/></span><span className="insight-tag">INFO LAB</span></div><strong>{activeLoans.length ? `${activeLoans.length} alat sedang digunakan` : 'Semua alat siap digunakan'}</strong><p>{activeLoans.length ? 'Jangan lupa kembalikan alat tepat waktu, ya.' : 'Yuk, mulai praktik dan pinjam alat yang kamu butuhkan.'}</p></div></div><div className="dashboard-grid"><section className="panel equipment-panel"><div className="panel-header"><div><h2>Alat laboratorium</h2><p>Inventaris alat TKJ yang tersedia</p></div><button className="text-button" onClick={() => setSection('Daftar alat')}>Lihat semua <ArrowRight size={15}/></button></div><ToolGrid tools={tools.slice(0,4)} borrowedByTool={borrowedByTool} onBorrow={(tool) => { setModal('loan'); setEditingTool(tool as Tool) }}/></section><section className="panel activity-panel"><div className="panel-header"><div><h2>Peminjaman terbaru</h2><p>Aktivitas peminjaman alat</p></div><button className="icon-button" aria-label="Lihat peminjaman" onClick={() => setSection('Peminjaman')}><ArrowRight size={17}/></button></div><LoanList loans={loans.slice(0,4)} onStatus={changeLoanStatus} onDelete={deleteLoan} showAction={!admin}/></section></div><section className="panel quick-panel"><div className="quick-icon"><ClipboardList size={20}/></div><div><strong>Butuh alat untuk praktik?</strong><p>Ajukan peminjaman sekarang, lalu kembalikan sesuai tanggal yang dipilih.</p></div><button className="secondary-btn" onClick={() => { setEditingTool(null); setModal('loan') }}>Buat peminjaman <ArrowRight size={15}/></button></section></>}
    {section === 'Daftar alat' && <section className="panel full-panel"><div className="filter-row"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau kategori alat..." aria-label="Cari alat"/></div><span className="result-count">{filteredTools.length} alat ditemukan</span></div><ToolGrid tools={filteredTools} borrowedByTool={borrowedByTool} onBorrow={(tool) => { setEditingTool(tool as Tool); setModal('loan') }}/></section>}
    {section === 'Kelola alat' && admin && <section className="panel full-panel"><div className="filter-row"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari alat..." aria-label="Cari alat"/></div><span className="result-count">{filteredTools.length} jenis peralatan</span></div><div className="table-scroll"><table><thead><tr><th>NAMA ALAT</th><th>KATEGORI</th><th>STOK</th><th>KONDISI</th><th>STATUS</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>{filteredTools.map((tool) => <tr key={tool.id}><td><strong className="table-tool-name"><span className="table-tool-icon"><Package size={16}/></span>{tool.nama}</strong></td><td>{tool.kategori}</td><td>{tool.stok} unit</td><td>{tool.kondisi}</td><td><span className={`stock-badge ${(tool.stok-(borrowedByTool[tool.id]??0)) > 0 ? 'available-badge' : 'empty-badge'}`}>{(tool.stok-(borrowedByTool[tool.id]??0)) > 0 ? 'Tersedia' : 'Habis'}</span></td><td><div className="table-actions"><button className="table-action" onClick={() => { setEditingTool(tool); setModal('tool') }} aria-label={`Edit ${tool.nama}`}><Settings2 size={16}/></button><button className="table-action danger-action" onClick={() => void removeTool(tool.id)} aria-label={`Hapus ${tool.nama}`}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div></section>}
    {section === 'Peminjaman' && <section className="panel full-panel"><div className="filter-row"><div className="panel-header inline-header"><div><h2>Daftar peminjaman</h2><p>{admin ? 'Seluruh transaksi peminjaman lab' : 'Peminjaman yang kamu ajukan'}</p></div></div><button className="secondary-btn" onClick={() => { setEditingTool(null); setModal('loan') }}><Plus size={16}/> Pinjam alat</button></div><LoanTable loans={loans} admin={!!admin} onStatus={changeLoanStatus} onDelete={deleteLoan}/></section>}
    {section === 'Laporan' && <><div className="report-summary"><StatCard icon={ClipboardList} label="Total transaksi" value={loans.length} detail="seluruh catatan pinjam" tone="blue"/><StatCard icon={Truck} label="Masih dipinjam" value={activeLoans.length} detail="belum dikembalikan" tone="amber"/><StatCard icon={Check} label="Dikembalikan" value={loans.filter((loan)=>loan.status==='Dikembalikan').length} detail="transaksi selesai" tone="green"/></div><section className="panel full-panel"><div className="panel-header"><div><h2>Rekap peminjaman</h2><p>Unduh data ini sebagai CSV untuk laporan sekolah.</p></div><button className="secondary-btn" onClick={exportReport}><ArrowDownToLine size={16}/> Unduh CSV</button></div><LoanTable loans={loans} admin={!!admin} onStatus={changeLoanStatus} onDelete={deleteLoan}/></section></>}
    <footer className="page-footer"><span><ShieldCheck size={14}/> PinjamLab TKJ · Data tersimpan aman</span><span>Laboratorium Teknik Komputer & Jaringan</span></footer></div></main>{mobileNav && <button className="nav-backdrop" aria-label="Tutup navigasi" onClick={() => setMobileNav(false)}/ >}{modal && <div className="modal-backdrop" onMouseDown={(event) => { if(event.target===event.currentTarget){setModal(null);setEditingTool(null)} }}><form className="modal-card" onSubmit={modal === 'loan' ? saveLoan : saveTool}><div className="modal-heading"><div><p className="eyebrow">{modal==='loan'?'PENGAJUAN ALAT':'INVENTARIS LAB'}</p><h2>{modal==='loan'?'Ajukan peminjaman':editingTool?'Edit alat':'Tambah alat baru'}</h2></div><button type="button" className="icon-button" aria-label="Tutup" onClick={() => { setModal(null); setEditingTool(null) }}><X size={19}/></button></div>{modal==='loan' ? <><label>Pilih alat<select name="alat_id" defaultValue={editingTool?.id ?? ''} required><option value="" disabled>Pilih alat yang tersedia</option>{tools.map((tool) => <option key={tool.id} value={tool.id} disabled={(borrowedByTool[tool.id]??0)>=tool.stok}>{tool.nama} · {(tool.stok-(borrowedByTool[tool.id]??0))} tersedia</option>)}</select></label><label>Nama peminjam<input name="nama_peminjam" defaultValue={profile?.display_name ?? ''} placeholder="Nama lengkap siswa" required/></label><label>Kelas<input name="kelas" placeholder="Contoh: XI TKJ 1" required/></label><div className="field-pair"><label>Tanggal pinjam<input name="tanggal_pinjam" type="date" defaultValue={today} required/></label><label>Tanggal kembali<input name="tanggal_kembali" type="date" min={today} required/></label></div><div className="form-hint"><CircleHelp size={15}/> Pastikan alat dikembalikan sesuai tanggal yang dipilih.</div></> : <><label>Nama alat<input name="nama" defaultValue={editingTool?.nama ?? ''} placeholder="Nama peralatan" required/></label><label>Kategori<input name="kategori" defaultValue={editingTool?.kategori ?? 'Peralatan TKJ'} placeholder="Kategori" required/></label><div className="field-pair"><label>Jumlah stok<input name="stok" type="number" min="0" defaultValue={editingTool?.stok ?? 1} required/></label><label>Kondisi<select name="kondisi" defaultValue={editingTool?.kondisi ?? 'Baik'}><option>Baik</option><option>Perlu perbaikan</option><option>Rusak</option></select></label></div></>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => { setModal(null); setEditingTool(null) }}>Batal</button><button className="primary-btn" type="submit">{modal==='loan'?'Ajukan pinjaman':'Simpan perubahan'} <ArrowRight size={16}/></button></div></form></div>}</div>
}

function StatCard({icon: Icon,label,value,detail,tone}:{icon:typeof Box;label:string;value:number;detail:string;tone:string}) { return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}><Icon size={19}/></span><span className="stat-kicker">TKJ LAB</span></div><p className="stat-label">{label}</p><div className="stat-value-row"><strong>{value}</strong><span>{detail}</span></div><div className={`stat-line ${tone}`}/></article> }
function ToolGrid({tools,borrowedByTool,onBorrow}:{tools:Tool[];borrowedByTool:Record<string,number>;onBorrow:(tool:Tool)=>void}) { if(!tools.length) return <div className="empty-state"><Package size={24}/><strong>Belum ada alat yang cocok</strong><span>Coba kata kunci lain.</span></div>; return <div className="tool-grid">{tools.map((tool,index)=>{const free=Math.max(0,tool.stok-(borrowedByTool[tool.id]??0));return <article className="tool-card" key={tool.id}><div className={`tool-illustration tool-color-${index%4}`}><span className="tool-illustration-mark"><Wrench size={24}/></span><span className="tool-stock">{free} tersedia</span></div><div className="tool-card-body"><p className="tool-category">{tool.kategori}</p><h3>{tool.nama}</h3><div className="tool-card-footer"><span><span className={`status-dot ${free?'dot-green':'dot-gray'}`}/>{free?'Siap dipinjam':'Stok habis'}</span><button disabled={!free} className="tool-borrow" onClick={()=>onBorrow(tool)} aria-label={`Pinjam ${tool.nama}`}><ArrowRight size={16}/></button></div></div></article>})}</div> }
function LoanList({loans,onStatus,onDelete,showAction}:{loans:Loan[];onStatus:(loan:Loan,status:Loan['status'])=>void;onDelete:(loan:Loan)=>void;showAction:boolean}) {if(!loans.length)return <div className="empty-state compact-empty"><ClipboardList size={23}/><strong>Belum ada peminjaman</strong><span>Transaksi terbaru akan muncul di sini.</span></div>;return <div className="activity-list">{loans.map((loan)=> <div className="activity-item" key={loan.id}><span className="activity-icon"><Package size={17}/></span><span className="activity-info"><strong>{loan.alat?.nama??'Alat lab'}</strong><small>{loan.nama_peminjam} · {formatDate(loan.tanggal_pinjam)}</small></span><span className={`status-pill ${loan.status==='Dipinjam'?'pill-borrowed':'pill-returned'}`}>{loan.status}</span>{showAction&&loan.status==='Dipinjam'&&<button className="return-mini" onClick={()=>onStatus(loan,'Dikembalikan')} aria-label="Tandai dikembalikan"><Check size={14}/></button>}</div>)}</div>}
function LoanTable({loans,admin,onStatus,onDelete}:{loans:Loan[];admin:boolean;onStatus:(loan:Loan,status:Loan['status'])=>void;onDelete:(loan:Loan)=>void}) {if(!loans.length)return <div className="empty-state"><ClipboardList size={24}/><strong>Belum ada transaksi</strong><span>Data peminjaman akan muncul setelah pengajuan dibuat.</span></div>;return <div className="table-scroll"><table><thead><tr><th>ALAT</th><th>PEMINJAM</th><th>KELAS</th><th>TGL PINJAM</th><th>TGL KEMBALI</th><th>STATUS</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>{loans.map((loan)=><tr key={loan.id}><td><strong>{loan.alat?.nama??'Alat lab'}</strong></td><td>{loan.nama_peminjam}</td><td>{loan.kelas}</td><td>{formatDate(loan.tanggal_pinjam)}</td><td>{formatDate(loan.tanggal_kembali)}</td><td><span className={`status-pill ${loan.status==='Dipinjam'?'pill-borrowed':'pill-returned'}`}>{loan.status}</span></td><td><div className="table-actions">{loan.status==='Dipinjam'&&<button className="table-action" title="Tandai dikembalikan" aria-label="Tandai dikembalikan" onClick={()=>onStatus(loan,'Dikembalikan')}><Check size={16}/></button>}<button className="table-action danger-action" title="Hapus peminjaman" aria-label="Hapus peminjaman" onClick={()=>onDelete(loan)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>}
