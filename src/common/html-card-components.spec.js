import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  await import('./html-card-components.js')
})

describe('HTML card parity custom elements', () => {
  it('registers the meter, tabs, list, and alert element families', () => {
    for (const name of [
      'hc-meter',
      'hc-tabs',
      'hc-tab',
      'hc-list',
      'hc-item',
      'hc-alert',
    ]) {
      expect(customElements.get(name), `${name} should be registered`).toBeDefined()
    }
  })

  it('renders hc-meter with a clamped percentage fill', () => {
    const meter = document.createElement('hc-meter')
    meter.setAttribute('label', 'HP')
    meter.setAttribute('value', '75')
    meter.setAttribute('max', '100')
    document.body.appendChild(meter)

    expect(meter.shadowRoot.querySelector('style').textContent).toContain('width: 75%')
    expect(meter.shadowRoot.querySelector('.meter-label').textContent).toBe('HP 75/100')

    meter.remove()
  })

  it('renders hc-tabs and switches the visible hc-tab', () => {
    const tabs = document.createElement('hc-tabs')
    tabs.innerHTML = `
      <hc-tab title="Stats">Stats content</hc-tab>
      <hc-tab title="Bag">Bag content</hc-tab>
    `
    document.body.appendChild(tabs)

    const panels = tabs.querySelectorAll(':scope > hc-tab')
    const buttons = tabs.querySelectorAll(':scope > .hc-tabs-header .hc-tabs-btn')
    expect(buttons).toHaveLength(2)
    tabs.switchTab(0)
    expect(panels[0].style.display).toBe('block')
    expect(panels[1].style.display).toBe('none')

    buttons[1].click()
    expect(buttons[1].classList.contains('active')).toBe(true)
    expect(panels[0].style.display).toBe('none')
    expect(panels[1].style.display).toBe('block')

    tabs.remove()
  })

  it('renders hc-list items with icon and slotted content structure', () => {
    const list = document.createElement('hc-list')
    const item = document.createElement('hc-item')
    item.setAttribute('icon', 'A')
    item.textContent = 'Iron sword'
    list.appendChild(item)
    document.body.appendChild(list)

    expect(document.getElementById('hc-list-style')).not.toBeNull()
    expect(item.shadowRoot.querySelector('.item-row')).not.toBeNull()
    expect(item.shadowRoot.querySelector('.icon').textContent).toBe('A')
    expect(item.shadowRoot.querySelector('.content slot')).not.toBeNull()

    list.remove()
  })

  it('renders hc-stat icon before the label (mobile parity)', () => {
    const stat = document.createElement('hc-stat')
    stat.setAttribute('label', 'HP')
    stat.setAttribute('value', '72/100')
    stat.setAttribute('icon', '❤️')
    document.body.appendChild(stat)

    const label = stat.shadowRoot.querySelector('.label')
    const icon = label.querySelector('.icon')
    expect(icon, 'icon span should render inside label').not.toBeNull()
    expect(icon.textContent).toBe('❤️')
    expect(label.textContent).toBe('❤️HP')

    stat.remove()
  })

  it('renders warning hc-alert with the warning palette', () => {
    const alert = document.createElement('hc-alert')
    alert.setAttribute('type', 'warning')
    alert.textContent = 'Watch out'
    document.body.appendChild(alert)

    const style = alert.shadowRoot.querySelector('style').textContent
    expect(alert.shadowRoot.querySelector('.alert')).not.toBeNull()
    expect(style).toContain('rgba(243, 156, 18, 0.15)')
    expect(style).toContain('var(--hc-warning, #f39c12)')

    alert.remove()
  })
})
