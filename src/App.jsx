import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import SkillsLibrary from './components/SkillsLibrary';
import SkillDetailModal from './components/SkillDetailModal';
import ImportHub from './components/ImportHub';
import ConnectAgents from './components/ConnectAgents';
import McpPlayground from './components/McpPlayground';
import { api } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'library';
  });

  const [serverInfo, setServerInfo] = useState(null);
  const [skills, setSkills] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [sources, setSources] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalSkill, setModalSkill] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Playground deep-link slug
  const [playgroundSlug, setPlaygroundSlug] = useState('');

  // Toast notifications
  const [toast, setToast] = useState(null);

  const notify = useCallback((message) => {
    setToast(message);
    setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 3200);
  }, []);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url);
  };

  const refreshAll = useCallback(async () => {
    try {
      const [infoRes, skillsRes, profilesRes, sourcesRes, actRes] = await Promise.all([
        api.getServerInfo(),
        api.getSkills(),
        api.getProfiles(),
        api.getSources(),
        api.getActivity(40),
      ]);
      setServerInfo(infoRes);
      setSkills(skillsRes.skills || []);
      setProfiles(profilesRes.profiles || []);
      setSources(sourcesRes.sources || []);
      setActivity(actRes.activity || []);
    } catch (err) {
      notify(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleToggleSkill = async (id, nextEnabled) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: nextEnabled } : s))
    );
    try {
      await api.updateSkill(id, { enabled: nextEnabled });
      const infoRes = await api.getServerInfo();
      setServerInfo(infoRes);
      const profRes = await api.getProfiles();
      setProfiles(profRes.profiles || []);
      notify(nextEnabled ? 'Skill enabled for MCP agents' : 'Skill hidden from MCP agents');
    } catch (err) {
      notify(err.message);
      refreshAll();
    }
  };

  const handleBatchAction = async (action, ids) => {
    try {
      const res = await api.batchSkills(action, ids);
      notify(`Updated ${res.affected} skill(s)`);
      await refreshAll();
    } catch (err) {
      notify(err.message);
    }
  };

  const handleSaveSkillModal = async (payload) => {
    try {
      if (isCreatingNew) {
        const res = await api.createSkill(payload);
        notify(`Created skill "${res.skill.name}"`);
      } else {
        const res = await api.updateSkill(payload.id, payload);
        notify(`Saved changes to "${res.skill.name}"`);
      }
      setModalSkill(null);
      setIsCreatingNew(false);
      await refreshAll();
    } catch (err) {
      notify(err.message);
    }
  };

  const handleDeleteSkill = async (id) => {
    try {
      await api.deleteSkill(id);
      setModalSkill(null);
      notify('Deleted skill from vault');
      await refreshAll();
    } catch (err) {
      notify(err.message);
    }
  };

  const handleTestSkillInMcp = (skill) => {
    setPlaygroundSlug(skill.slug);
    switchTab('playground');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={switchTab}
        serverInfo={serverInfo}
        onNewSkill={() => {
          setModalSkill(null);
          setIsCreatingNew(true);
        }}
      />

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          {activeTab === 'library' && (
            <SkillsLibrary
              skills={skills}
              loading={loading}
              onOpenSkill={(skill) => {
                setIsCreatingNew(false);
                setModalSkill(skill);
              }}
              onToggleSkill={handleToggleSkill}
              onBatchAction={handleBatchAction}
              onNavigateImport={() => switchTab('import')}
              onTestSkillInMcp={handleTestSkillInMcp}
              notify={notify}
            />
          )}

          {activeTab === 'import' && (
            <ImportHub
              sources={sources}
              onImported={async () => {
                await refreshAll();
                switchTab('library');
              }}
              notify={notify}
            />
          )}

          {activeTab === 'connect' && (
            <ConnectAgents
              profiles={profiles}
              skills={skills}
              serverInfo={serverInfo}
              onProfilesChanged={refreshAll}
              notify={notify}
            />
          )}

          {activeTab === 'playground' && (
            <McpPlayground
              profiles={profiles}
              skills={skills}
              initialSkillSlug={playgroundSlug}
              activity={activity}
              onRefreshActivity={async () => {
                const act = await api.getActivity(40);
                setActivity(act.activity || []);
              }}
            />
          )}
        </div>
      </main>

      {(isCreatingNew || modalSkill) && (
        <SkillDetailModal
          skill={modalSkill}
          isNew={isCreatingNew}
          onClose={() => {
            setModalSkill(null);
            setIsCreatingNew(false);
          }}
          onSave={handleSaveSkillModal}
          onDelete={handleDeleteSkill}
          notify={notify}
        />
      )}

      {/* Subtle Bottom-Right Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-100 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
