const try_preset_url = "/try_preset/";

const feature_example_container = document.getElementById("featureExamplesContainer");

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
const csrftoken = getCookie('csrftoken');

feature_example_container.addEventListener("click", async (event) => {
    const button = event.target.closest(".try-feature-button");
    if (!button) return;

    const preset_id = button.getAttribute("data-feature-id");

    const form_data = new FormData();
    form_data.append("preset_id", preset_id);
    const res = await fetch(try_preset_url, {
        method: "POST",
        body: form_data,
        headers: { "X-CSRFToken": csrftoken },
        credentials: "same-origin",
    });
    if (!res.ok) console.error("Save failed:", res.status);
});
