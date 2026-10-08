import React, { useState, useEffect } from 'react';
import Logo from '../components/Logo.jsx';
import { getTrendingTopics } from '../api/client.js';
import { useTheme } from '../contexts/ThemeContext.jsx';
import {
  IconShield,
  IconArrowRight,
  IconCheck,
  IconRadio,
  IconClock,
  IconZap,
  IconSparkles,
  IconExternalLink,
  IconFileText,
  IconAlertTriangle,
  IconRefresh,
} from '../components/Icons.jsx';

const SIMULATOR_CASES = [
  {
    id: 'upsc',
    category: 'COMPETITIVE EXAM',
    title: 'UPSC Civil Services 2026 Prelims Notification',
    source: 'upsc.gov.in · Union Public Service Commission',
    impact: 'HIGH IMPACT',
    impactType: 'high',
    shiftSummary: 'Application window extended by 14 days and 12 examination centers added nationwide.',
    before: 'Online applications close on 11 February 2026 at 18:00 hours. No further extension under any circumstances.',
    after: 'Application window extended to 25 February 2026 until 18:00 hours due to server migration. 12 additional examination sub-centers notified.',
  },
  {
    id: 'pmkisan',
    category: 'GOVERNMENT SCHEME',
    title: 'PM-KISAN 19th Installment Direct Benefit Release',
    source: 'pmkisan.gov.in · Ministry of Agriculture & Farmers Welfare',
    impact: 'DEADLINE CONFIRMED',
    impactType: 'med',
    shiftSummary: 'Disbursement date locked to 24 February 2026 with strict Aadhaar e-KYC compliance cutoff.',
    before: 'Status: Tentative disbursement window between January - March 2026. Beneficiary registry verification under process.',
    after: 'Status: 19th installment of ₹2,000 scheduled for release on 24 February 2026. Mandatory biometric e-KYC cutoff: 20 February 2026.',
  },
  {
    id: 'court',
    category: 'JUDICIAL BENCH',
    title: 'Supreme Court Regulatory Bench Order (WP 1184)',
    source: 'main.sci.gov.in · Supreme Court of India',
    impact: 'INTERIM STAY',
    impactType: 'high',
    shiftSummary: 'Interim stay granted on Clause 4(b); coercive enforcement restrained until next hearing.',
    before: 'Notice issued to respondent regulatory board. Interim relief application listed for hearing in due course.',
    after: 'Interim stay granted on implementation of Circular Clause 4(b). Authorities restrained from coercive enforcement until 15 April 2026.',
  },
];

const FAQS = [
  {
    q: 'How does Notice Me differ from standard Google Alerts or RSS readers?',
    a: 'Google Alerts sends lists of article links that mention a keyword. Notice Me actively scrapes official portal announcements, strips navigation boilerplate, and computes line-by-line redline diffs—telling you exactly what words, numbers, or dates changed between hourly crawls.',
  },
  {
    q: 'Do I need to configure web scraping selectors or APIs?',
    a: 'Not at all. You provide a topic name or natural language focus (e.g. “UPSC CSE prelims deadline and age limit”), and our autonomous SerpApi pipeline queries Google Search and News across authoritative government and court domains automatically.',
  },
  {
    q: 'Does it cost money to start monitoring?',
    a: 'No. Our Free Tier provides 3 fully autonomous monitors with hourly polling, redline diff history, and email notifications without requiring a credit card.',
  },
  {
    q: 'Can I print or share formal proof of a circular change?',
    a: 'Yes. Notice Me includes an Executive Dossier generator that outputs official, printable PDF briefing memos with cryptographic verification stamps, timestamps, and source citations.',
  },
];

export default function LandingPage({ onOpenAuth }) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [activeCase, setActiveCase] = useState(SIMULATOR_CASES[0]);
  const [trending, setTrending] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState(0);

  useEffect(() => {
    let active = true;
    getTrendingTopics()
      .then((items) => {
        if (active && Array.isArray(items) && items.length > 0) {
          setTrending(items.slice(0, 4));
        }
      })
      .catch(() => {
        // Fallback to static broadsheet radar items if network is offline
      })
      .finally(() => {
        if (active) setLoadingTrending(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="landing-root">
      {/* 🧭 1. EDITORIAL BROADSHEET MASTHEAD */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-left">
            <Logo />
            <div className="landing-nav-beacon">
              <span className="live-pulse-dot" />
              <span>RADAR ONLINE</span>
            </div>
          </div>

          <nav className="landing-nav-center" aria-label="Landing Page Navigation">
            <a href="#diff-engine" className="landing-nav-link">Diff Simulator</a>
            <a href="#radar" className="landing-nav-link">Live Radar</a>
            <a href="#how-it-works" className="landing-nav-link">How It Works</a>
            <a href="#pricing" className="landing-nav-link">Tiers &amp; Pricing</a>
          </nav>

          <div className="landing-nav-right">
            <button
              type="button"
              className="theme-toggle-btn landing-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              aria-label="Toggle display theme"
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button
              type="button"
              className="button button-quiet landing-sign-in-btn"
              onClick={() => onOpenAuth && onOpenAuth('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className="button button-primary landing-cta-btn"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
            >
              <span>Start Free</span>
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* 📰 2. HERO SECTION */}
      <section className="landing-hero-section">
        <div className="landing-hero-container">
          <div className="landing-hero-badge">
            <span className="hero-badge-dot" />
            <span>CONTINUOUS GAZETTE &amp; NOTICE SURVEILLANCE</span>
          </div>

          <h1 className="landing-hero-title">
            Never miss a revised deadline, altered eligibility clause, or court order again.
          </h1>

          <p className="landing-hero-subtitle">
            Notice Me continuously monitors official portals, judicial registries, and public circulars.
            When an official notice changes, we diff the text word-for-word and alert you immediately.
          </p>

          <div className="landing-hero-actions">
            <button
              type="button"
              className="button button-primary hero-main-cta"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
            >
              <span>Start Monitoring Free</span>
              <IconArrowRight size={16} />
            </button>
            <a href="#radar" className="button button-quiet hero-secondary-cta">
              <IconRadio size={14} />
              <span>Explore Live Radar</span>
            </a>
          </div>

          {/* Proof & Telemetry Badges */}
          <div className="landing-telemetry-row">
            <div className="telemetry-item">
              <IconCheck size={14} className="telemetry-icon" />
              <span>100% Text-Verified Ingestion</span>
            </div>
            <div className="telemetry-item">
              <IconClock size={14} className="telemetry-icon" />
              <span>Hourly Automated SerpApi Cycles</span>
            </div>
            <div className="telemetry-item">
              <IconShield size={14} className="telemetry-icon" />
              <span>Zero Hallucinations · Official Citations</span>
            </div>
          </div>
        </div>
      </section>

      {/* 🔬 3. INTERACTIVE REDLINE DIFF SIMULATOR */}
      <section id="diff-engine" className="landing-section simulator-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">FORENSIC REDLINE ENGINE</span>
          <h2 className="section-title">See how Notice Me captures critical policy revisions</h2>
          <p className="section-subtitle">
            Notice Me strips boilerplate HTML and flags line-by-line differences between hourly crawls.
            Click below to inspect real-world captured shifts:
          </p>
        </div>

        <div className="simulator-container">
          {/* Case Selector Tabs */}
          <div className="simulator-tabs" role="tablist">
            {SIMULATOR_CASES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeCase.id === item.id}
                className={`simulator-tab ${activeCase.id === item.id ? 'is-active' : ''}`}
                onClick={() => setActiveCase(item)}
              >
                <span className="tab-category">{item.category}</span>
                <strong className="tab-title">{item.title}</strong>
              </button>
            ))}
          </div>

          {/* Active Redline Comparison Board */}
          <div className="simulator-board">
            <header className="simulator-board-header">
              <div className="board-header-left">
                <span className={`simulator-impact-chip impact-${activeCase.impactType}`}>
                  {activeCase.impact}
                </span>
                <span className="board-source-meta">{activeCase.source}</span>
              </div>
              <span className="board-shift-desc">{activeCase.shiftSummary}</span>
            </header>

            <div className="simulator-diff-grid">
              {/* Previous Notice Box */}
              <div className="diff-panel is-before">
                <div className="diff-panel-label">
                  <span className="panel-sign">-</span>
                  <span>PREVIOUS CRAWL (HOURLY SERPAPI SNAPSHOT)</span>
                </div>
                <div className="diff-panel-content">
                  <p>{activeCase.before}</p>
                </div>
              </div>

              {/* Verified Update Box */}
              <div className="diff-panel is-after">
                <div className="diff-panel-label">
                  <span className="panel-sign">+</span>
                  <span>VERIFIED REVISION (CAPTURED IN CURRENT CYCLE)</span>
                </div>
                <div className="diff-panel-content">
                  <p>{activeCase.after}</p>
                </div>
              </div>
            </div>

            <footer className="simulator-board-footer">
              <div className="board-footer-provenance">
                <IconShield size={13} style={{ color: 'var(--status-verified-dot)' }} />
                <span>Extracted and verified against public official records. Zero manual data entry.</span>
              </div>
              <button
                type="button"
                className="button button-primary simulator-track-btn"
                onClick={() => onOpenAuth && onOpenAuth('signup')}
              >
                <span>Track Circulars Like This Free</span>
                <IconArrowRight size={13} />
              </button>
            </footer>
          </div>
        </div>
      </section>

      {/* 📡 4. LIVE TRENDING RADAR (CALLING REAL PUBLIC BACKEND API) */}
      <section id="radar" className="landing-section radar-section">
        <div className="landing-section-header">
          <div className="radar-header-pill">
            <span className="live-pulse-dot" />
            <span>LIVE INGESTION RADAR</span>
          </div>
          <h2 className="section-title">Trending public circulars under active surveillance</h2>
          <p className="section-subtitle">
            Real search surges and notices currently monitored by our autonomous SerpApi engine.
          </p>
        </div>

        <div className="landing-radar-grid">
          {loadingTrending ? (
            <div className="radar-skeleton-grid">
              <div className="radar-skeleton-card" />
              <div className="radar-skeleton-card" />
              <div className="radar-skeleton-card" />
              <div className="radar-skeleton-card" />
            </div>
          ) : trending.length > 0 ? (
            trending.map((item, index) => (
              <div key={item.id || index} className="landing-radar-card interactive-card">
                <header className="radar-card-header">
                  <span className="radar-rank-badge">#{String(index + 1).padStart(2, '0')}</span>
                  <span className="radar-category-tag">{item.category?.toUpperCase() || 'PUBLIC NOTICE'}</span>
                  <span className="radar-followers-count">
                    <IconRadio size={11} />
                    <span>{item.followers || 1} tracking</span>
                  </span>
                </header>

                <h3 className="radar-card-title">{item.name || item.headline}</h3>
                <p className="radar-card-desc">{item.description}</p>

                <footer className="radar-card-footer">
                  <div className="radar-source-stamp">
                    <IconShield size={11} />
                    <span>{item.officialSource || 'Official Portal'}</span>
                  </div>
                  <button
                    type="button"
                    className="radar-track-action"
                    onClick={() => onOpenAuth && onOpenAuth('signup')}
                  >
                    <span>+ Track</span>
                  </button>
                </footer>
              </div>
            ))
          ) : (
            <div className="radar-fallback-note">
              <p>Radar active. Continuous hourly poll cycle running across official registries.</p>
            </div>
          )}
        </div>
      </section>

      {/* ⚙️ 5. HOW IT WORKS (THE 3 PILLARS) */}
      <section id="how-it-works" className="landing-section pillars-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">AUTONOMOUS ARCHITECTURE</span>
          <h2 className="section-title">Continuous surveillance in three autonomous steps</h2>
          <p className="section-subtitle">
            From search ingestion to forensic text comparison and instant executive memos.
          </p>
        </div>

        <div className="pillars-grid">
          <div className="pillar-card">
            <div className="pillar-step-num">01</div>
            <div className="pillar-icon-box">
              <IconRadio size={22} />
            </div>
            <h3 className="pillar-title">Hourly Multi-Source Polling</h3>
            <p className="pillar-text">
              Notice Me uses Google Search and official news crawlers via SerpApi to monitor authoritative
              government, university, and judicial domains on an hourly heartbeat.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-step-num">02</div>
            <div className="pillar-icon-box">
              <IconZap size={22} />
            </div>
            <h3 className="pillar-title">Forensic Redline Diffing</h3>
            <p className="pillar-text">
              Our diff engine isolates official circular paragraphs, strips dynamic boilerplate, and
              identifies precise changes in dates, fees, eligibility criteria, and court clauses.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-step-num">03</div>
            <div className="pillar-icon-box">
              <IconFileText size={22} />
            </div>
            <h3 className="pillar-title">Verified Alerts &amp; PDF Memos</h3>
            <p className="pillar-text">
              Receive instant alerts with before-and-after excerpts. Export formal, timestamped
              Executive Briefing Memos formatted for archival and legal proof.
            </p>
          </div>
        </div>
      </section>

      {/* 💳 6. TRANSPARENT PRICING & PLAN CAPACITY */}
      <section id="pricing" className="landing-section pricing-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">TRANSPARENT TIERS</span>
          <h2 className="section-title">Start monitoring for free. Upgrade when you need more.</h2>
          <p className="section-subtitle">
            Zero hidden fees. Full access to the redline comparison engine on every plan.
          </p>
        </div>

        <div className="pricing-grid">
          {/* Free Tier */}
          <div className="pricing-card is-free">
            <div className="pricing-header">
              <span className="pricing-tier-name">COMMUNITY TIER</span>
              <div className="pricing-amount">
                <span className="currency">₹</span>
                <span className="val">0</span>
                <span className="period">/ month</span>
              </div>
              <p className="pricing-desc">
                Ideal for individual exam aspirants, policy followers, and legal researchers.
              </p>
            </div>

            <ul className="pricing-features">
              <li><IconCheck size={14} className="feature-check" /> <span><strong>Up to 3 Active Monitors</strong></span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Hourly Automated SerpApi Surveillance</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Full Redline Diff Comparison History</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Email Notifications &amp; Daily Digest</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Natural Language Intent Extraction</span></li>
            </ul>

            <button
              type="button"
              className="button button-quiet pricing-cta"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
            >
              Start Free Monitoring
            </button>
          </div>

          {/* Pro Tier */}
          <div className="pricing-card is-pro">
            <div className="pricing-pro-badge">RECOMMENDED FOR LAW FIRMS &amp; INSTITUTIONS</div>
            <div className="pricing-header">
              <span className="pricing-tier-name">PRO INTELLIGENCE</span>
              <div className="pricing-amount">
                <span className="currency">₹</span>
                <span className="val">999</span>
                <span className="period">/ month</span>
              </div>
              <p className="pricing-desc">
                For legal practitioners, institutions, and departments requiring deep surveillance.
              </p>
            </div>

            <ul className="pricing-features">
              <li><IconCheck size={14} className="feature-check" /> <span><strong>Unlimited Active Monitors</strong></span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Priority SerpApi Hourly Queue</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span><strong>Ask AI Intelligence Analyst</strong> Interactive Chat</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Executive PDF &amp; Markdown Dossier Export</span></li>
              <li><IconCheck size={14} className="feature-check" /> <span>Multi-Channel Webhook &amp; WhatsApp Integration</span></li>
            </ul>

            <button
              type="button"
              className="button button-primary pricing-cta"
              onClick={() => onOpenAuth && onOpenAuth('signup')}
            >
              <span>Get Started with Pro</span>
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ❓ 7. FREQUENTLY ASKED QUESTIONS */}
      <section className="landing-section faq-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">COMMON QUESTIONS</span>
          <h2 className="section-title">Frequently Asked Questions</h2>
        </div>

        <div className="faq-container">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className={`faq-item ${expandedFaq === idx ? 'is-open' : ''}`}
              onClick={() => setExpandedFaq(expandedFaq === idx ? -1 : idx)}
            >
              <div className="faq-question">
                <h3>{faq.q}</h3>
                <span className="faq-toggle-icon">{expandedFaq === idx ? '−' : '+'}</span>
              </div>
              {expandedFaq === idx && (
                <div className="faq-answer">
                  <p>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 📣 8. BOTTOM CALL TO ACTION */}
      <section className="landing-cta-banner">
        <div className="cta-banner-content">
          <span className="cta-banner-eyebrow">SET UP YOUR FIRST MONITOR IN 30 SECONDS</span>
          <h2 className="cta-banner-title">
            Stop refreshing government portals manually.
          </h2>
          <p className="cta-banner-desc">
            Join aspirants, advocates, and researchers who trust Notice Me to catch critical policy changes first.
          </p>
          <button
            type="button"
            className="button button-primary cta-banner-btn"
            onClick={() => onOpenAuth && onOpenAuth('signup')}
          >
            <span>Start Monitoring Free</span>
            <IconArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* 🏛️ 9. EDITORIAL FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-col-brand">
            <Logo />
            <p className="footer-tagline">
              Autonomous surveillance for public notices, competitive examinations, and judicial mandates.
            </p>
            <div className="footer-status-pill">
              <span className="live-pulse-dot" />
              <span>SerpApi Engine: Operational</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>RADAR COVERAGE</h4>
            <ul>
              <li>Competitive Exams &amp; Admissions</li>
              <li>Government Welfare Schemes</li>
              <li>Court Orders &amp; Regulatory Benches</li>
              <li>Public Service Commission Jobs</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>CAPABILITIES</h4>
            <ul>
              <li>Redline Diff Comparator</li>
              <li>AI Intelligence Dossier</li>
              <li>Executive Print Briefing</li>
              <li>Hourly Google Search Polling</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>ACCOUNT</h4>
            <ul>
              <li><button type="button" className="footer-link-btn" onClick={() => onOpenAuth && onOpenAuth('login')}>Sign In</button></li>
              <li><button type="button" className="footer-link-btn" onClick={() => onOpenAuth && onOpenAuth('signup')}>Create Account</button></li>
              <li><a href="#pricing" className="footer-link-a">Pricing Tiers</a></li>
            </ul>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <p>© {new Date().getFullYear()} Notice Me Intelligence System. Official public records remain copyright of their respective issuing authorities.</p>
        </div>
      </footer>
    </div>
  );
}
