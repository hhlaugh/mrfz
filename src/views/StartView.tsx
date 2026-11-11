import React from 'react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

interface StartViewProps {
  readonly onHotseat: () => void;
  readonly onVsBot: () => void;
  readonly onOnline: () => void;
  readonly onDeckEditor: () => void;
}

export function StartView({ onHotseat, onVsBot, onOnline, onDeckEditor }: StartViewProps) {
  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      {/* Central Terminal Console Panel */}
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        grid
        className="w-full max-w-4xl border border-[#4a555b] shadow-2xl overflow-hidden"
      >
        {/* Top Operational Status Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h1 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                PRTS // TACTICAL TERMINAL
              </h1>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                RHODES ISLAND TACTICAL COMMAND SYSTEM
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="rarity" value={6}>v0.8 竞技规则</Badge>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 border border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-b from-[#1b2025] to-[#14181c] border-b border-[#2d353b]">
          <div className="flex-1 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#e5a52b] tracking-wider uppercase">
              <span>RHODES ISLAND OPERATIONAL CARD GAME</span>
              <span>·</span>
              <span>88 CARDS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide m-0">
              明日方舟卡牌对战终端
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              全量 80 位干员、6 张战术卡与 2 张支援卡全量支持。体验原汁原味的阻挡线争夺、技力回转、费用调度与干员再部署战术。
            </p>
          </div>

          {/* Quick Deck Builder Launcher */}
          <div className="w-full md:w-auto shrink-0 flex flex-col items-center">
            <Button
              variant="outline"
              size="lg"
              cornerCut
              onClick={onDeckEditor}
              className="w-full md:w-auto font-bold tracking-wide"
            >
              🎴 卡组构筑器 (Deck Builder)
            </Button>
            <span className="text-[10px] text-slate-400 font-mono mt-1.5">
              已载入 88 张卡牌全量图鉴与官方预设
            </span>
          </div>
        </div>

        {/* Tactical Battle Modes Selection Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Mode 1: VS Bot */}
          <div
            onClick={onVsBot}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-[#e5a52b] transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#e5a52b] font-bold">MODE 01</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">AI SIM</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-[#e5a52b] transition-colors m-0">
                单人对战（vs 机器人）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                执玩家 A 对阵规则引擎本地 AI。AI 严格遵守全部卡牌部署与攻防规则。
              </p>
            </div>
            <Button variant="primary" size="sm" cornerCut className="w-full">
              进入作战
            </Button>
          </div>

          {/* Mode 2: Hotseat */}
          <div
            onClick={onHotseat}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-sky-400 transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-sky-400 font-bold">MODE 02</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">LOCAL</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors m-0">
                本地热座（双人同屏）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                双人同屏轮流出牌与攻防推演，完整经历选牌、调度与三路对推。
              </p>
            </div>
            <Button variant="secondary" size="sm" cornerCut className="w-full hover:border-sky-400">
              同屏对战
            </Button>
          </div>

          {/* Mode 3: Online Room */}
          <div
            onClick={onOnline}
            className="group relative flex flex-col justify-between p-4 bg-[#191e24] hover:bg-[#20272f] border border-[#38424b] hover:border-rose-400 transition-all cursor-pointer select-none"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
          >
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-rose-400 font-bold">MODE 03</span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2">P2P RTC</span>
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors m-0">
                好友对战（P2P 联机）
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                基于 WebRTC 直连，生成房间码即可跨设备实时联机对决，无需第三方中继。
              </p>
            </div>
            <Button variant="secondary" size="sm" cornerCut className="w-full hover:border-rose-400">
              联机大厅
            </Button>
          </div>
        </div>

        {/* Terminal Footer System Status Info */}
        <div className="px-6 py-3 bg-[#121518] border-t border-[#2d353b] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>PRTS TERMINAL PROTOCOL: TACTICAL-v0.8</span>
            <span>·</span>
            <span>ASSET ENGINE: PRESENTATION-v1.1</span>
          </div>
          <div>RHODES ISLAND PHARMACEUTICAL TACTICS</div>
        </div>
      </Panel>
    </div>
  );
}
