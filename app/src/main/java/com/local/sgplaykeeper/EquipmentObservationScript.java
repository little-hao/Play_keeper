package com.local.sgplaykeeper;

/**
 * Read-only DOM adapter. Never derives an observed name from the configured target list.
 * Missing/ambiguous names or unproven pet scope require human verification.
 */
final class EquipmentObservationScript {
    private EquipmentObservationScript() {}

    static final String READ = """
        (function() {
          const visible = e => e && e.getClientRects().length > 0;
          const panels = Array.from(document.querySelectorAll('.left-box')).filter(visible);
          if (panels.length !== 1) return JSON.stringify({status:'unknown', reason:'装备区域不唯一或未加载'});
          const panel = panels[0];
          const main = panel.getAttribute('data-pet-scope') === 'main'
            || !!panel.closest('[data-main-pet="true"]');
          const labels = ['头部','身体','脚部','武器','项链','戒指','翅膀','手镯','宝石','道具'];
          const observed = {};
          for (let i = 0; i < labels.length; i++) {
            const slots = Array.from(panel.querySelectorAll('.item' + (i + 1))).filter(visible);
            if (slots.length !== 1) continue;
            const slot = slots[0];
            const nodes = [slot, ...slot.querySelectorAll('[data-equipment-name],img[alt],img[title]')];
            const names = new Set();
            for (const node of nodes) {
              const name = (node.getAttribute('data-equipment-name')
                || node.getAttribute('alt') || node.getAttribute('title') || '').trim();
              if (name && !labels.includes(name)) names.add(name);
            }
            if (names.size === 1) observed[labels[i]] = [...names][0];
          }
          return JSON.stringify({status:'observed', main, observed,
            reason:main ? '已读取网页提供的装备名称' : '页面未提供可验证的主宠标识'});
        })()
        """;
}
