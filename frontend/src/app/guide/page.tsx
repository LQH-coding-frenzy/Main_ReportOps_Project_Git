'use client';

import { Suspense } from 'react';

function GuidePageContent() {
  return (
    <>
      {/* Navbar Minimal for Guide Page */}
      <nav className="navbar" style={{ position: 'fixed', width: '100%' }}>
        <a href="/dashboard" className="navbar-brand">
          <span className="navbar-brand-icon">📋</span>
          ReportOps
        </a>
        <ul className="navbar-nav">
          <li>
            <a href="/dashboard" className="btn btn-secondary btn-sm">
              ← Về Dashboard
            </a>
          </li>
        </ul>
      </nav>

      {/* Main Guide Content */}
      <div className="page" style={{ paddingTop: '80px' }}>
        <div className="container">
          {/* Header Section */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-12)', animation: 'slide-up-fade 0.8s ease-out' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '24px',
              background: 'var(--gradient-primary)',
              fontSize: '2rem',
              boxShadow: 'var(--shadow-glow)',
              marginBottom: 'var(--space-6)'
            }}>
              ✍️
            </div>
            <h1 className="page-title" style={{ fontSize: 'var(--text-5xl)', letterSpacing: '-0.02em', marginBottom: 'var(--space-4)' }}>
              Standard Writing Guide
            </h1>
            <p className="page-subtitle" style={{ maxWidth: '600px', margin: '0 auto', fontSize: 'var(--text-lg)' }}>
              Quy chuẩn biên soạn Báo cáo Hệ thống & Bảo mật. Thực hiện đúng để đảm bảo công cụ tự động ghép nối (Merge Build) vận hành ổn định.
            </p>
          </div>

          <div className="grid grid-2" style={{ gap: 'var(--space-8)' }}>
            
            {/* Cấu trúc Heading */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header" style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '2rem', background: 'var(--color-bg-glass)', padding: '0.5rem', borderRadius: 'var(--radius-lg)' }}>📑</div>
                  <div>
                    <h2 className="card-title" style={{ fontSize: 'var(--text-2xl)' }}>1. Cấu trúc Tiêu đề (Heading)</h2>
                    <p style={{ color: 'var(--color-text-tertiary)' }}>Hệ thống dựa vào thẻ Heading để nhận diện mục lục.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-glass)', border: '1px solid var(--color-accent-success-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <span className="badge badge-success">ĐÚNG - DO</span>
                    <span style={{ fontSize: 'var(--text-2xl)' }}>✅</span>
                  </div>
                  <h1 style={{ fontSize: '1.4rem', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Heading 1: Tên Mục (Ví dụ: 1.1.1 Ensure...)</h1>
                  <h2 style={{ fontSize: '1.1rem', color: 'var(--color-accent-info)', marginBottom: '0.25rem' }}>Heading 2: Profile Applicability:</h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>Nội dung profile...</p>
                  <h2 style={{ fontSize: '1.1rem', color: 'var(--color-accent-info)', marginBottom: '0.25rem' }}>Heading 2: Description:</h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Mô tả chi tiết...</p>
                </div>

                <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-glass)', border: '1px solid var(--color-accent-danger-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <span className="badge badge-danger">SAI - DON'T</span>
                    <span style={{ fontSize: 'var(--text-2xl)' }}>❌</span>
                  </div>
                  <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'gray' }}>Heading 2: Tên Mục (Vô tình làm mờ tên mục)</h2>
                  <h1 style={{ fontSize: '1.6rem', color: 'var(--color-accent-danger)', borderBottom: '2px dotted red', marginBottom: '1rem' }}>Heading 1: Profile Applicability (Gây hỏng mục lục!)</h1>
                  <h1 style={{ fontSize: '1.6rem', color: 'var(--color-accent-danger)', borderBottom: '2px dotted red' }}>Heading 1: Description (Lỗi merge)</h1>
                </div>
              </div>
            </div>

            {/* Định dạng lệnh và code */}
            <div className="card">
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>💻</div>
              <h3 className="card-title" style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>2. Code & Câu lệnh</h3>
              <p className="card-body" style={{ marginBottom: 'var(--space-4)' }}>
                Bất kỳ câu lệnh Bash, PowerShell hoặc Block Cấu hình nào cũng phải được đặt trong khối lệnh hoặc dùng phông chữ dạng <code>Monospace</code>. Tên file/đường dẫn phải được <i>in nghiêng</i>.
              </p>
              <div style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#a5b4fc', borderLeft: '4px solid var(--color-accent-primary)' }}>
                # Mở file /etc/ssh/sshd_config<br/>
                cat /etc/passwd | grep root
              </div>
            </div>

            {/* Định dạng Bảng biểu */}
            <div className="card">
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>📊</div>
              <h3 className="card-title" style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>3. Bảng biểu (Tables)</h3>
              <p className="card-body" style={{ marginBottom: 'var(--space-4)' }}>
                Khi dán thông số, hãy sử dụng công cụ Insert Table trên Editor. Luôn tuỳ chỉnh độ dài bảng là <b>Fit to Window (100%)</b> để bảng không bị tràn ra khỏi trang giấy khi in.
              </p>
              <div className="table-container">
                <table style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr><th>Parameter</th><th>Value</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>PermitRootLogin</td><td>no</td></tr>
                    <tr><td>Port</td><td>22</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cảnh báo và Mẹo */}
            <div className="card" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
                <div style={{ fontSize: '3rem' }}>⚠️</div>
                <div>
                  <h3 className="card-title" style={{ fontSize: 'var(--text-2xl)', color: 'var(--color-accent-warning)', paddingBottom: '0.5rem' }}>Các lỗi gây "chết" Report Build cần tránh</h3>
                  <ul style={{ paddingLeft: '1.5rem', color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <li><b>Copy Paste từ web:</b> Lấy nguyên CSS ẩn hoặc Bảng HTML lồng nhau từ các trang web (ví dụ copy từ PDF/HTML trực tiếp) sẽ làm hỏng file DOCX. Hãy <i>Paste as Plain Text</i> (Ctrl+Shift+V) và dùng công cụ format của editor.</li>
                    <li><b>Lạm dụng Enter:</b> Không dùng phím Enter > 5 lần liền nhau để sang trang. Hãy dùng tính năng <i>Page Break</i>.</li>
                    <li><b>Kích thước Ảnh Khổng Lồ:</b> Đừng dán thẳng ảnh nặng 10MB vào doc. Screenshot vừa đủ (tối đa chiều rộng 16cm) để file Build ra nhẹ nhàng.</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="spinner" /><span>Đang tải...</span></div>}>
      <GuidePageContent />
    </Suspense>
  );
}
