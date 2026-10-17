import { api, ApiError, type AdminProfile } from './api';
import { h, toast } from './dom';
import { AVATARS, COLORS, MAX_PROFILES_LIMIT, NAME_MAX } from './profileOptions';

/**
 * The admin page (#admin): only the owner, with the admin password, creates and manages profiles
 * and sets how many there can be.
 */
export class AdminView {
  private formCount = 0;

  constructor(private root: HTMLElement) {}

  async show(): Promise<void> {
    this.root.replaceChildren(h('section', 'card', h('p', 'muted', 'Loading…')));
    try {
      const { profiles, maxProfiles } = await api.admin.list();
      this.render(profiles, maxProfiles);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) this.renderLogin();
      else this.renderProblem(e);
    }
  }

  private renderProblem(e: ApiError): void {
    const text = e.status === 0 ? 'The admin page needs the online server: profiles are not available here.' : e.message;
    this.root.replaceChildren(h('section', 'card', h('h2', '', 'Admin'), h('p', '', text)));
  }

  private renderLogin(): void {
    const input = h('input', '') as HTMLInputElement;
    input.type = 'password';
    input.id = 'admin-password';
    input.autocomplete = 'current-password';
    input.required = true;
    const label = h('label', '', 'Admin password');
    label.setAttribute('for', 'admin-password');
    const error = h('p', 'error');
    error.setAttribute('role', 'alert');
    const submit = h('button', 'primary', 'Sign in') as HTMLButtonElement;
    submit.type = 'submit';
    const form = h('form', 'admin-form', label, input, error, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      submit.disabled = true;
      try {
        await api.admin.login(input.value);
        await this.show();
      } catch (err) {
        const x = err as ApiError;
        error.textContent = x.status === 401 ? `Wrong password. ${x.body.triesLeft} ${x.body.triesLeft === 1 ? 'try' : 'tries'} left before a lock.` : x.message;
        input.select();
      } finally {
        submit.disabled = false;
      }
    });
    this.root.replaceChildren(
      h('section', 'card admin-login', h('h2', '', 'Admin'), h('p', 'muted', 'Create and manage the profiles of this site.'), form),
    );
    input.focus();
  }

  private render(profiles: AdminProfile[], max: number): void {
    const signOut = h('button', '', 'Sign out of admin');
    signOut.addEventListener('click', async () => {
      await api.admin.logout().catch(() => {});
      this.renderLogin();
    });

    // ---------- the profiles
    const list = h('ul', 'admin-profiles');
    for (const p of profiles) list.append(this.profileRow(p));
    if (!profiles.length) list.append(h('li', 'muted', 'No profile yet: create the first one below.'));
    const profilesCard = h(
      'section',
      'card',
      h('div', 'admin-head', h('h2', '', 'Profiles ', h('span', 'count', `${profiles.length} / ${max}`)), signOut),
      h('p', 'muted', 'Names and avatars are shown to every visitor on the profile picker: nicknames are a good idea.'),
      list,
    );

    // ---------- a new profile
    const full = profiles.length >= max;
    const create = this.profileForm({
      submitLabel: 'Create profile',
      pinRequired: true,
      onSubmit: async v => {
        await api.admin.create({ name: v.name, avatar: v.avatar, color: v.color, pin: v.pin! });
        toast(`Profile ${v.name} created.`);
        await this.show();
      },
    });
    if (full) create.querySelectorAll('input, button').forEach(el => ((el as HTMLInputElement).disabled = true));
    const createCard = h(
      'section',
      'card',
      h('h2', '', 'New profile'),
      full ? h('p', 'muted', `The limit of ${max} profiles is reached: raise it below to add more.`) : h('p', 'muted', 'Give the person their PIN; they can use it on any device.'),
      create,
    );

    // ---------- settings
    const maxInput = h('input', '') as HTMLInputElement;
    maxInput.type = 'number';
    maxInput.id = 'admin-max';
    maxInput.min = String(Math.max(1, profiles.length));
    maxInput.max = String(MAX_PROFILES_LIMIT);
    maxInput.value = String(max);
    const maxLabel = h('label', '', 'Maximum number of profiles');
    maxLabel.setAttribute('for', 'admin-max');
    const maxError = h('p', 'error');
    maxError.setAttribute('role', 'alert');
    const save = h('button', 'primary', 'Save') as HTMLButtonElement;
    save.type = 'submit';
    const settingsForm = h('form', 'admin-form', maxLabel, h('div', 'admin-inline', maxInput, save), maxError);
    settingsForm.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api.admin.setMaxProfiles(Number(maxInput.value));
        toast('Saved.');
        await this.show();
      } catch (err) {
        maxError.textContent = (err as ApiError).message;
      }
    });
    const settingsCard = h('section', 'card', h('h2', '', 'Settings'), settingsForm);

    this.root.replaceChildren(profilesCard, createCard, settingsCard);
  }

  private profileRow(p: AdminProfile): HTMLElement {
    const now = Date.now();
    const status =
      p.lockedUntil > now
        ? `🔒 Locked until ${new Date(p.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : p.failed > 0
          ? `${p.failed} wrong ${p.failed === 1 ? 'try' : 'tries'}`
          : p.lastLogin
            ? `Last sign-in ${new Date(p.lastLogin).toLocaleDateString()}`
            : 'Never signed in';
    const av = h('span', 'avatar', p.avatar);
    av.style.background = p.color;
    const edit = h('button', '', 'Edit');
    const actions = h('div', 'admin-actions', edit);
    if (p.failed > 0 || p.lockedUntil > now) {
      const unlock = h('button', '', 'Unlock');
      unlock.addEventListener('click', async () => {
        await this.run(() => api.admin.update(p.id, { unlock: true }), `${p.name} is unlocked.`);
      });
      actions.append(unlock);
    }
    const del = h('button', 'danger', 'Delete');
    del.addEventListener('click', async () => {
      if (!confirm(`Delete ${p.name} and all of their work (games, progress, ratings)? This cannot be undone.`)) return;
      await this.run(() => api.admin.remove(p.id), `${p.name} was deleted.`);
    });
    actions.append(del);
    const row = h('li', 'admin-profile', av, h('div', 'admin-who', h('strong', '', p.name), h('span', 'muted', status)), actions);
    edit.addEventListener('click', () => {
      const form = this.profileForm({
        initial: p,
        submitLabel: 'Save',
        pinRequired: false,
        onSubmit: async v => {
          const patch: Parameters<typeof api.admin.update>[1] = {};
          if (v.name !== p.name) patch.name = v.name;
          if (v.avatar !== p.avatar) patch.avatar = v.avatar;
          if (v.color !== p.color) patch.color = v.color;
          if (v.pin) patch.pin = v.pin;
          if (Object.keys(patch).length) await api.admin.update(p.id, patch);
          toast(v.pin ? `Saved. ${v.name} is signed out on every device.` : 'Saved.');
          await this.show();
        },
        onCancel: () => row.replaceWith(this.profileRow(p)),
      });
      row.replaceChildren(form);
      row.classList.add('editing');
    });
    return row;
  }

  private async run(action: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await action();
      toast(done);
    } catch (err) {
      toast((err as ApiError).message);
    }
    await this.show();
  }

  /** Name, avatar, color and PIN (required for a new profile; empty keeps the PIN when editing). */
  private profileForm(options: {
    initial?: AdminProfile;
    submitLabel: string;
    pinRequired: boolean;
    onSubmit: (v: { name: string; avatar: string; color: string; pin?: string }) => Promise<void>;
    onCancel?: () => void;
  }): HTMLElement {
    const n = ++this.formCount;
    const { initial } = options;
    const name = h('input', '') as HTMLInputElement;
    name.id = `pf-name-${n}`;
    name.maxLength = NAME_MAX;
    name.required = true;
    name.autocomplete = 'off';
    name.value = initial?.name ?? '';
    const nameLabel = h('label', '', 'Name');
    nameLabel.setAttribute('for', name.id);

    const choices = (legend: string, field: string, values: string[], current: string, swatch: boolean) => {
      const set = h('fieldset', 'admin-choices', h('legend', '', legend));
      values.forEach((v, i) => {
        const input = h('input', '') as HTMLInputElement;
        input.type = 'radio';
        input.name = `${field}-${n}`;
        input.value = v;
        input.checked = v === current || (!current && i === 0);
        const face = h('span', swatch ? 'swatch' : 'emoji', swatch ? '' : v);
        if (swatch) face.style.background = v;
        const label = h('label', 'choice', input, face);
        label.title = v;
        set.append(label);
      });
      return set;
    };
    const avatars = choices('Avatar', 'avatar', AVATARS, initial?.avatar ?? '', false);
    const colors = choices('Color', 'color', COLORS, initial?.color ?? '', true);

    const pinField = (id: string, text: string) => {
      const input = h('input', '') as HTMLInputElement;
      input.id = id;
      input.type = 'password';
      input.inputMode = 'numeric';
      input.pattern = '[0-9]{4}';
      input.maxLength = 4;
      input.autocomplete = 'new-password';
      input.required = options.pinRequired;
      const label = h('label', '', text);
      label.setAttribute('for', id);
      return { input, label };
    };
    const pin = pinField(`pf-pin-${n}`, options.pinRequired ? 'PIN (4 digits)' : 'New PIN (leave empty to keep it)');
    const pin2 = pinField(`pf-pin2-${n}`, 'PIN again');
    const error = h('p', 'error');
    error.setAttribute('role', 'alert');
    const submit = h('button', 'primary', options.submitLabel) as HTMLButtonElement;
    submit.type = 'submit';
    const buttons = h('div', 'admin-inline', submit);
    if (options.onCancel) {
      const cancel = h('button', '', 'Cancel') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', options.onCancel);
      buttons.append(cancel);
    }
    const form = h(
      'form',
      'admin-form',
      nameLabel,
      name,
      avatars,
      colors,
      h('div', 'admin-pins', h('div', '', pin.label, pin.input), h('div', '', pin2.label, pin2.input)),
      error,
      buttons,
    );
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const value = (field: string) => (form.querySelector(`input[name="${field}-${n}"]:checked`) as HTMLInputElement).value;
      if (pin.input.value !== pin2.input.value) {
        error.textContent = 'The two PINs are different.';
        return;
      }
      if (pin.input.value && !/^\d{4}$/.test(pin.input.value)) {
        error.textContent = 'A PIN is exactly 4 digits.';
        return;
      }
      submit.disabled = true;
      try {
        await options.onSubmit({ name: name.value, avatar: value('avatar'), color: value('color'), pin: pin.input.value || undefined });
      } catch (err) {
        error.textContent = (err as ApiError).message;
      } finally {
        submit.disabled = false;
      }
    });
    return form;
  }
}
