import type { Metadata } from "next";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, STEP_LABEL, type Template } from "@/lib/admin";
import { createTemplate, deleteTemplate, saveTemplate } from "../../actions";

export const metadata: Metadata = { title: "Templates" };

function Fields({ t, id }: { t?: Template; id: string }) {
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`n-${id}`}>Name</label>
        <input id={`n-${id}`} name="name" defaultValue={t?.name} required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor={`st-${id}`}>Used for</label>
        <select id={`st-${id}`} name="step" defaultValue={t?.step ?? 0}>
          {STEP_LABEL.map((l, i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field full">
        <label htmlFor={`s-${id}`}>Subject</label>
        <input id={`s-${id}`} name="subject" defaultValue={t?.subject} required maxLength={200} />
      </div>
      <div className="field full">
        <label htmlFor={`b-${id}`}>Message</label>
        <textarea id={`b-${id}`} name="body" rows={9} defaultValue={t?.body} required maxLength={8000} />
      </div>
    </div>
  );
}

export default async function TemplatesPage() {
  const templates = await adminApi<Template[]>("/templates");
  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Templates</h1>
          <p>
            Starting points for each email. You can still edit every draft before approving it. Fill-ins: {"{{brand}}"}, {"{{firstName}}"}, {"{{category}}"},{" "}
            {"{{website}}"}.
          </p>
        </div>
      </div>
      <div className="stack-16">
        {templates.map((t) => (
          <section key={t.id} className="card">
            <h2>{t.name}</h2>
            <div className="pad">
              <ActionForm action={saveTemplate.bind(null, t.id)}>
                <Fields t={t} id={t.id} />
                <div className="form-actions">
                  <Submit>Save</Submit>
                  <ActButton action={deleteTemplate.bind(null, t.id)} className="btn" confirm={`Delete the "${t.name}" template?`}>
                    Delete
                  </ActButton>
                </div>
              </ActionForm>
            </div>
          </section>
        ))}
        <details className="disclose-box">
          <summary>Add a template</summary>
          <div className="pad">
            <ActionForm action={createTemplate} resetOnSuccess>
              <Fields id="new" />
              <div className="form-actions">
                <Submit>Add template</Submit>
              </div>
            </ActionForm>
          </div>
        </details>
      </div>
    </>
  );
}
