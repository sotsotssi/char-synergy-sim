// ============================================================================
// --- 모듈 1: DATA_CONFIG ---
// ============================================================================
import { RAW_KEYWORDS, TRAIT_DEFINITIONS, TYPE_LABELS, CHEMISTRY_DICT } from './char_data.js';
// ============================================================================
// --- 모듈 2: SIMULATION_TEXT_DATA ---
// ============================================================================
import { EVENT_TEMPLATES } from './simulation_data.js';

// ============================================================================
// --- 모듈 3: CORE_LOGIC ---
// ============================================================================
const APP_URL = "https://sotsotssi.github.io/char-synergy-sim";

let keywords = [];
let selectedKeywords = [];
let characters = [];
let selectedForSynergy = [];
let editingCharId = null;

function initData() {
    keywords = RAW_KEYWORDS.map(raw => {
        const [word, category, weightsStr] = raw.split('|');
        const [ext, agr, con, sta, ope, hon, dom] = weightsStr.split(',').map(Number);
        return { word, category, weights: { ext, agr, con, sta, ope, hon, dom } };
    });
    keywords.sort((a, b) => a.word.localeCompare(b.word));
    loadFromLocal();
}

function saveToLocal() {
    localStorage.setItem('comm_simulator_chars', JSON.stringify(characters));
}

function loadFromLocal() {
    const data = localStorage.getItem('comm_simulator_chars');
    if (data) {
        try {
            characters = JSON.parse(data);
            renderRoster();
        } catch(e) { console.error("데이터 파싱 오류"); }
    }
}

function calculateTraits(selectedKws) {
    const scores = { ext: 0, agr: 0, con: 0, sta: 0, ope: 0, hon: 0, dom: 0 };
    selectedKws.forEach(kw => {
        for (const key in scores) scores[key] += kw.weights[key];
    });

    const MAX_POSSIBLE = 15; 
    const normalized = {};
    const binaryOptions = { ext:[], agr:[], con:[], sta:[], ope:[], hon:[], dom:[] };

    for (const key in scores) {
        let percent = (scores[key] / MAX_POSSIBLE) * 100;
        percent = Math.max(-100, Math.min(100, percent));
        normalized[key] = percent;

        if (scores[key] === 0 && selectedKws.length > 0) binaryOptions[key] = ['0', '1'];
        else if (scores[key] > 0) binaryOptions[key] = ['1'];
        else binaryOptions[key] = ['0'];
    }

    let possibleTypes = [];
    if (selectedKws.length > 0) {
        const keys = ['ext', 'agr', 'con', 'sta', 'ope', 'hon', 'dom'];
        function generateCombinations(index, currentStr) {
            if (index === keys.length) { possibleTypes.push(currentStr); return; }
            binaryOptions[keys[index]].forEach(val => generateCombinations(index + 1, currentStr + val));
        }
        generateCombinations(0, "");
    }

    return { normalized, possibleTypes, rawScores: scores };
}

function calculateSimilarity(charA, charB) {
    let totalDiff = 0;
    TRAIT_DEFINITIONS.forEach(trait => {
        const valA = charA.traits[trait.id] || 0;
        const valB = charB.traits[trait.id] || 0;
        totalDiff += Math.abs(valA - valB);
    });
    const averageDiff = totalDiff / 7;
    let score = Math.max(0, 100 - (averageDiff / 1.5));
    return Math.round(score);
}

function getTopTraitKey(char) {
    let maxAbs = -1;
    let topKey = 'EP';
    TRAIT_DEFINITIONS.forEach(def => {
        const score = char.rawScores[def.id];
        if (Math.abs(score) > maxAbs) {
            maxAbs = Math.abs(score);
            topKey = score >= 0 ? def.posKey : def.negKey;
        }
    });
    return topKey;
}

function saveCharacter() {
    const nameInput = document.getElementById('char-name');
    const name = nameInput.value.trim();
    if (selectedKeywords.length < 3 || name === '') return;

    const result = calculateTraits(selectedKeywords);
    const charData = {
        name: name,
        keywords: [...selectedKeywords],
        traits: result.normalized,
        rawScores: result.rawScores,
        typeDesc: TYPE_LABELS[result.possibleTypes[0]]
    };

    if (editingCharId) {
        const index = characters.findIndex(c => c.id === editingCharId);
        if (index > -1) characters[index] = { ...characters[index], ...charData };
    } else {
        charData.id = Date.now().toString();
        characters.push(charData);
    }

    cancelEdit();
    saveToLocal();
    renderRoster();
}

function loadCharacterForEdit(id) {
    const char = characters.find(c => c.id === id);
    if (!char) return;
    document.getElementById('char-name').value = char.name;
    selectedKeywords = [...char.keywords];
    editingCharId = id;
    updateUIState();
    renderRoster();
}

function cancelEdit() {
    editingCharId = null;
    selectedKeywords = [];
    document.getElementById('char-name').value = '';
    updateUIState();
    renderRoster();
}

function deleteCharacter() {
    if (!editingCharId) return;
    if (confirm('이 캐릭터를 정말 삭제하시겠습니까?')) {
        characters = characters.filter(c => c.id !== editingCharId);
        selectedForSynergy = selectedForSynergy.filter(id => id !== editingCharId);
        cancelEdit();
        saveToLocal();
        renderRoster();
    }
}

function deleteSelectedCharacters() {
    if (selectedForSynergy.length === 0) return;
    if (confirm(`선택된 ${selectedForSynergy.length}명의 캐릭터를 삭제하시겠습니까?`)) {
        characters = characters.filter(c => !selectedForSynergy.includes(c.id));
        if (selectedForSynergy.includes(editingCharId)) cancelEdit();
        selectedForSynergy = [];
        saveToLocal();
        renderRoster();
    }
}

function toggleSynergySelection(charId) {
    const index = selectedForSynergy.indexOf(charId);
    if (index > -1) selectedForSynergy.splice(index, 1);
    else {
        if (selectedForSynergy.length >= 4) { alert('시너지 분석은 최대 4명까지만 선택 가능합니다.'); return; }
        selectedForSynergy.push(charId);
    }
    renderRoster();
}

// ============================================================================
// [3] UI 렌더링
// ============================================================================
function renderKeywords() {
    const container = document.getElementById('keyword-container');
    const search = document.getElementById('keyword-search').value.trim().toLowerCase();
    const sortType = document.getElementById('sort-type').value;
    let filtered = keywords.filter(k => k.word.toLowerCase().includes(search));
    container.innerHTML = '';

    if (sortType === 'alphabet') {
        const grid = document.createElement('div');
        grid.className = 'flex flex-wrap gap-2';
        filtered.forEach(kw => grid.appendChild(createKeywordBtn(kw)));
        container.appendChild(grid);
    } else {
        const grouped = filtered.reduce((acc, kw) => {
            (acc[kw.category] = acc[kw.category] || []).push(kw);
            return acc;
        }, {});
        for (const [category, words] of Object.entries(grouped)) {
            const section = document.createElement('div');
            section.className = 'mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm';
            section.innerHTML = `<h4 class="text-sm font-bold text-gray-600 mb-3 pb-2 border-b border-gray-100">${category} <span class="text-gray-400 font-normal text-xs ml-1">(${words.length})</span></h4>`;
            const grid = document.createElement('div');
            grid.className = 'flex flex-wrap gap-2';
            words.forEach(kw => grid.appendChild(createKeywordBtn(kw)));
            section.appendChild(grid);
            container.appendChild(section);
        }
    }
}

function createKeywordBtn(kw) {
    const btn = document.createElement('button');
    const isSelected = selectedKeywords.some(sk => sk.word === kw.word);
    btn.className = `keyword-btn px-3 py-1.5 rounded-full text-sm font-medium border ${isSelected ? 'selected' : 'border-gray-300 text-gray-700 bg-white'}`;
    btn.textContent = kw.word;
    btn.onclick = () => toggleKeyword(kw);
    return btn;
}

function toggleKeyword(kw) {
    const index = selectedKeywords.findIndex(sk => sk.word === kw.word);
    if (index > -1) selectedKeywords.splice(index, 1);
    else {
        if (selectedKeywords.length >= 10) { alert('키워드는 최대 10개까지만 선택할 수 있습니다.'); return; }
        selectedKeywords.push(kw);
    }
    updateUIState();
}

function randomSelectKeywords() {
    selectedKeywords = [];
    const count = Math.floor(Math.random() * 6) + 5;
    const shuffled = [...keywords].sort(() => 0.5 - Math.random());
    selectedKeywords = shuffled.slice(0, count);
    updateUIState();
}

function updateUIState() {
    const countSpan = document.getElementById('selection-count');
    countSpan.textContent = `선택됨: ${selectedKeywords.length} / 3~10개`;
    if (selectedKeywords.length >= 3 && selectedKeywords.length <= 10) countSpan.className = "text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full";
    else countSpan.className = "text-sm font-semibold text-blue-600 bg-blue-100 px-3 py-1 rounded-full";

    renderKeywords();

    const saveBtn = document.getElementById('save-char-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const deleteBtn = document.getElementById('delete-char-btn');
    const nameInput = document.getElementById('char-name').value.trim();
    const panelTitle = document.getElementById('panel-title');
    const panelIcon = document.getElementById('panel-icon');
    const indicator = document.getElementById('edit-indicator');

    if (editingCharId) {
        panelTitle.textContent = "캐릭터 수정";
        panelIcon.className = "fas fa-user-edit mr-2 text-green-500";
        indicator.classList.remove('hidden'); cancelBtn.classList.remove('hidden'); deleteBtn.classList.remove('hidden');
        saveBtn.innerHTML = '<i class="fas fa-edit mr-1.5"></i>수정 완료';
        saveBtn.classList.replace('bg-blue-600', 'bg-green-600'); saveBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
    } else {
        panelTitle.textContent = "새 캐릭터 생성";
        panelIcon.className = "fas fa-user-plus mr-2 text-blue-500";
        indicator.classList.add('hidden'); cancelBtn.classList.add('hidden'); deleteBtn.classList.add('hidden');
        saveBtn.innerHTML = '<i class="fas fa-save mr-1.5"></i>저장하기';
        saveBtn.classList.replace('bg-green-600', 'bg-blue-600'); saveBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    }

    saveBtn.disabled = selectedKeywords.length < 3 || selectedKeywords.length > 10 || nameInput === '';

    const result = calculateTraits(selectedKeywords);
    renderTraitBars(result.normalized, 'traits-preview');
    renderTypeLabels(result.possibleTypes);
}

function renderTypeLabels(typeCodes) {
    const container = document.getElementById('type-labels-preview');
    container.innerHTML = '';
    if (typeCodes.length === 0) {
        container.innerHTML = '<span class="text-xs text-gray-400">우측에서 키워드를 선택하세요.</span>';
        return;
    }
    typeCodes.forEach(code => {
        const desc = TYPE_LABELS[code] || "알 수 없는 유형";
        const span = document.createElement('span');
        span.className = 'bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-[11px] font-medium border border-indigo-100';
        span.textContent = desc;
        container.appendChild(span);
    });
}

function renderTraitBars(traits, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    TRAIT_DEFINITIONS.forEach(trait => {
        const value = traits[trait.id] || 0;
        let left = 50, width = 0;
        if (value < 0) { width = Math.abs(value) / 2; left = 50 - width; } 
        else { width = value / 2; left = 50; }
        if (width === 0 && (containerId==='traits-preview' ? selectedKeywords.length > 0 : true)) width = 0.5;

        const row = document.createElement('div');
        row.className = 'flex flex-col mb-2.5';
        row.innerHTML = `
            <div class="text-[11px] font-bold text-gray-700 text-center mb-1">${trait.name}</div>
            <div class="flex items-center text-[11px]">
                <div class="w-14 text-right pr-2 text-gray-500 truncate">${trait.left}</div>
                <div class="flex-1 trait-bar-container">
                    <div class="trait-bar-center"></div>
                    <div class="trait-bar-fill ${trait.color}" style="left: ${left}%; width: ${width}%;"></div>
                </div>
                <div class="w-14 text-left pl-2 text-gray-500 truncate">${trait.right}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderRoster() {
    const container = document.getElementById('roster-container');
    const emptyMsg = document.getElementById('empty-roster-msg');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    
    emptyMsg.style.display = characters.length > 0 ? 'none' : 'block';
    if (selectedForSynergy.length > 0) deleteSelectedBtn.classList.remove('hidden');
    else deleteSelectedBtn.classList.add('hidden');

    container.querySelectorAll('.char-card').forEach(el => el.remove());

    characters.forEach(char => {
        const isSelected = selectedForSynergy.includes(char.id);
        const isEditing = editingCharId === char.id;
        
        const card = document.createElement('div');
        card.className = `char-card bg-white p-3 rounded-lg border border-gray-200 cursor-pointer shadow-sm hover:shadow-md ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`;
        card.onclick = (e) => toggleSynergySelection(char.id);
        card.ondblclick = (e) => { e.preventDefault(); loadCharacterForEdit(char.id); };
        
        card.innerHTML = `
            <div class="font-bold text-gray-800 text-sm mb-1.5 flex justify-between items-center">
                <span class="truncate pr-2 pointer-events-none">${char.name}</span>
                <div class="flex items-center gap-1 shrink-0 bg-transparent">                            <button class="text-gray-400 hover:text-blue-600 transition-colors px-1" title="프로필 이미지 캡처" onclick="event.stopPropagation(); downloadProfile('${char.id}')"><i class="fas fa-camera"></i></button>
                    <button class="text-gray-400 hover:text-slate-800 transition-colors px-1 mr-1" title="X(트위터)에 공유" onclick="event.stopPropagation(); shareProfileToX('${char.id}')"><i class="fab fa-x-twitter"></i></button>
                    ${isSelected ? '<i class="fas fa-check-circle text-blue-500 text-lg pointer-events-none"></i>' : '<i class="far fa-circle text-gray-200 pointer-events-none"></i>'}
                </div>
            </div>
            <div class="text-[11px] text-gray-500 mb-1.5 truncate pointer-events-none">${char.keywords.map(k => k.word).join(', ')}</div>
            <div class="text-[10px] text-purple-600 font-semibold truncate bg-purple-50 inline-block px-1.5 py-0.5 rounded pointer-events-none border border-purple-100">${char.typeDesc}</div>
        `;
        container.appendChild(card);
    });

    document.getElementById('analyze-btn').disabled = selectedForSynergy.length < 2 || selectedForSynergy.length > 4;
    document.getElementById('roleplay-btn').disabled = selectedForSynergy.length !== 2;
}

// ============================================================================
// [4] 시너지 분석 및 롤플레잉
// ============================================================================
function analyzeSynergy() {
    if (selectedForSynergy.length < 2) return;
    const selectedChars = selectedForSynergy.map(id => characters.find(c => c.id === id));
    const resultContainer = document.getElementById('synergy-capture-area');
    resultContainer.innerHTML = '';

    const titleHtml = document.createElement('div');
    titleHtml.className = 'mb-6 text-center';
    const charNames = selectedChars.map(c => `<span class="font-bold text-indigo-600">${c.name}</span>`).join(' <i class="fas fa-link text-gray-300 mx-2"></i> ');
    titleHtml.innerHTML = `<h3 class="text-xl mb-2">${charNames}</h3>`;
    resultContainer.appendChild(titleHtml);

    if (selectedChars.length === 2) renderPairwiseAnalysis(selectedChars[0], selectedChars[1], resultContainer);
    else renderGroupAnalysis(selectedChars, resultContainer);

    const footerHtml = document.createElement('div');
    footerHtml.className = 'text-[10px] text-center text-gray-400 mt-6 pt-4 border-t border-gray-200';
    footerHtml.innerHTML = '#캐릭터_시너지_시뮬레이터 @bb_uu_t';
    resultContainer.appendChild(footerHtml);

    const spacerHtml = document.createElement('div');
    spacerHtml.className = 'h-2 w-full';
    resultContainer.appendChild(spacerHtml);

    document.getElementById('synergy-modal').classList.remove('hidden');
}

function renderPairwiseAnalysis(charA, charB, container) {
    const topKeyA = getTopTraitKey(charA);
    const topKeyB = getTopTraitKey(charB);
    const sortedKeys = [topKeyA, topKeyB].sort();
    const dictKey = `${sortedKeys[0]}_${sortedKeys[1]}`;
    const chemiDescription = CHEMISTRY_DICT[dictKey] || "서로의 다름을 이해해 나가는 평범하고 무난한 관계입니다.";
    const score = calculateSimilarity(charA, charB);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'bg-indigo-50 p-6 rounded-xl mb-8 border border-indigo-100 shadow-sm';
    summaryDiv.innerHTML = `
        <div class="text-sm text-indigo-500 font-bold mb-4 text-center tracking-widest uppercase">핵심 시너지 (궁합: ${score}%)</div>
        <div class="flex justify-center items-center gap-8 mb-6">
            <div class="text-center w-32">
                <span class="block text-lg font-bold text-gray-800 mb-1">${charA.name}</span>
                <span class="block text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm text-gray-600 font-medium">${topKeyA}형</span>
            </div>
            <i class="fas fa-bolt text-yellow-500 text-3xl opacity-80"></i>
            <div class="text-center w-32">
                <span class="block text-lg font-bold text-gray-800 mb-1">${charB.name}</span>
                <span class="block text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm text-gray-600 font-medium">${topKeyB}형</span>
            </div>
        </div>
        <div class="text-base bg-white p-5 rounded-lg text-gray-700 border border-gray-100 shadow-sm leading-relaxed text-center font-medium">
            <i class="fas fa-quote-left text-indigo-200 text-xl mr-2 align-top"></i>${chemiDescription}<i class="fas fa-quote-right text-indigo-200 text-xl ml-2 align-bottom"></i>
        </div>
    `;
    container.appendChild(summaryDiv);

    const detailTitle = document.createElement('h4');
    detailTitle.className = 'text-base font-bold text-gray-700 mb-5 pb-2 border-b-2 border-gray-200 inline-block';
    detailTitle.textContent = '세부 성향 비교';
    container.appendChild(detailTitle);

    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = 'bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-5';
    TRAIT_DEFINITIONS.forEach(trait => {
        const valA = charA.traits[trait.id]; const valB = charB.traits[trait.id];
        const row = document.createElement('div');
        row.innerHTML = `
            <div class="flex justify-between text-sm mb-2 text-gray-500 font-medium">
                <span class="w-1/3 text-left truncate text-blue-600">${charA.name}</span>
                <span class="w-1/3 text-center text-gray-800">${trait.name}</span>
                <span class="w-1/3 text-right truncate text-red-600">${charB.name}</span>
            </div>
            <div class="relative h-3 bg-gray-200 rounded-full mx-2">
                <div class="absolute w-4 h-4 bg-blue-500 rounded-full top-1/2 transform -translate-y-1/2 -translate-x-1/2 shadow-md z-10" style="left: ${(valA + 100) / 2}%"></div>
                <div class="absolute w-4 h-4 bg-red-500 rounded-full top-1/2 transform -translate-y-1/2 -translate-x-1/2 shadow-md z-10" style="left: ${(valB + 100) / 2}%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-1.5 mx-2"><span>${trait.left}</span><span>${trait.right}</span></div>
        `;
        comparisonDiv.appendChild(row);
    });
    container.appendChild(comparisonDiv);
}

function renderGroupAnalysis(chars, container) {
    let totalScore = 0, pairCount = 0;
    const gridDiv = document.createElement('div');
    gridDiv.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

    for (let i = 0; i < chars.length; i++) {
        for (let j = i + 1; j < chars.length; j++) {
            const cA = chars[i], cB = chars[j];
            const score = calculateSimilarity(cA, cB);
            totalScore += score; pairCount++;
            
            const sortedKeys = [getTopTraitKey(cA), getTopTraitKey(cB)].sort();
            const chemiDesc = CHEMISTRY_DICT[`${sortedKeys[0]}_${sortedKeys[1]}`] || "평범하고 무난한 동료입니다.";

            const pairCard = document.createElement('div');
            pairCard.className = 'bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow';
            pairCard.innerHTML = `
                <div class="font-bold text-gray-800 mb-3 flex items-center justify-center gap-2 text-base">
                    <span class="text-blue-600">${cA.name}</span>
                    <span class="text-[11px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">궁합 ${score}%</span>
                    <span class="text-red-600">${cB.name}</span>
                </div>
                <div class="text-gray-600 text-sm text-center bg-gray-50 p-3 rounded-lg leading-relaxed">${chemiDesc}</div>
            `;
            gridDiv.appendChild(pairCard);
        }
    }
    
    const avgScore = Math.round(totalScore / pairCount);
    let gradeText = avgScore >= 80 ? "최상의 팀워크" : avgScore >= 60 ? "안정적인 그룹" : avgScore >= 40 ? "역동적인 그룹" : "아슬아슬한 그룹";

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'bg-purple-50 p-6 rounded-xl mb-8 border border-purple-100 shadow-sm text-center';
    summaryDiv.innerHTML = `
        <div class="text-sm text-purple-500 font-bold mb-2 tracking-widest uppercase">그룹 종합 궁합</div>
        <div class="text-4xl font-black text-purple-700 mb-2">${avgScore}%</div>
        <div class="text-lg font-bold text-gray-800 mb-2">${gradeText}</div>
        <div class="text-sm text-gray-600">그룹 내 모든 1:1 관계의 유사도를 평균 낸 수치입니다.</div>
    `;
    container.appendChild(summaryDiv);
    
    const pairTitle = document.createElement('h4');
    pairTitle.className = 'text-base font-bold text-gray-700 mb-5 pb-2 border-b-2 border-gray-200 inline-block';
    pairTitle.textContent = '그룹 내 1:1 관계 요약';
    container.appendChild(pairTitle);
    container.appendChild(gridDiv);
}

/* --- 모달 2: 러닝 상황극 시뮬레이터 --- */
let rpCharA, rpCharB;

function openRoleplayModal() {
    if (selectedForSynergy.length !== 2) return;
    rpCharA = characters.find(c => c.id === selectedForSynergy[0]);
    rpCharB = characters.find(c => c.id === selectedForSynergy[1]);

    document.getElementById('rp-char-a-name').textContent = rpCharA.name;
    document.getElementById('rp-char-b-name').textContent = rpCharB.name;
    document.getElementById('roleplay-modal').classList.remove('hidden');
    
    if (document.getElementById('roleplay-log-container').children.length === 0) continueRoleplay();
}

function closeRoleplayModal() { document.getElementById('roleplay-modal').classList.add('hidden'); }
function clearRoleplayLog() { document.getElementById('roleplay-log-container').innerHTML = ''; }

function hasJongseong(name) {
    if (!name || name.length === 0) return false;
    const lastChar = name.charCodeAt(name.length - 1);
    if (lastChar < 0xAC00 || lastChar > 0xD7A3) return false; 
    return (lastChar - 0xAC00) % 28 > 0;
}

function formatSimulationText(text, charA, charB) {
    const regex = /\{(Char[AB])\}(은\(는\)|이\(가\)|을\(를\)|와\(과\))?/g;
    return text.replace(regex, (match, charKey, particle) => {
        const isCharA = charKey === 'CharA';
        const charObj = isCharA ? charA : charB;
        const name = charObj.name;
        const colorClass = isCharA ? 'text-blue-400' : 'text-red-400';
        const styledName = `<span class="font-bold ${colorClass}">${name}</span>`;
        
        if (!particle) return styledName; 
        const hasBachim = hasJongseong(name);
        let selectedParticle = '';
        switch(particle) {
            case '은(는)': selectedParticle = (hasBachim ? '은' : '는'); break;
            case '이(가)': selectedParticle = (hasBachim ? '이' : '가'); break;
            case '을(를)': selectedParticle = (hasBachim ? '을' : '를'); break;
            case '와(과)': selectedParticle = (hasBachim ? '과' : '와'); break;
            default: selectedParticle = particle;
        }
        return styledName + selectedParticle;
    });
}

function continueRoleplay() {
    if (!rpCharA || !rpCharB) return;
    
    let specificMatches = [];
    let generalMatch = null;

    for (const tmpl of EVENT_TEMPLATES) {
        if (tmpl.id === "GENERAL_INTERACTION") { generalMatch = tmpl; continue; }
        if (tmpl.condition(rpCharA, rpCharB)) specificMatches.push({ template: tmpl, roleA: rpCharA, roleB: rpCharB });
        if (tmpl.condition(rpCharB, rpCharA)) specificMatches.push({ template: tmpl, roleA: rpCharB, roleB: rpCharA });
    }

    let selectedSituation;
    if (specificMatches.length > 0) {
        selectedSituation = specificMatches[Math.floor(Math.random() * specificMatches.length)];
    } else {
        selectedSituation = Math.random() > 0.5 ? { template: generalMatch, roleA: rpCharA, roleB: rpCharB } : { template: generalMatch, roleA: rpCharB, roleB: rpCharA };
    }

    const rawText = selectedSituation.template.texts[Math.floor(Math.random() * selectedSituation.template.texts.length)];
    const logText = formatSimulationText(rawText, selectedSituation.roleA, selectedSituation.roleB);
    
    const container = document.getElementById('roleplay-log-container');
    const logEntry = document.createElement('div');
    logEntry.className = 'p-4 bg-slate-800/80 rounded-lg border-l-4 border-indigo-500 leading-relaxed text-[15px] animate-fade-in-up shadow-sm';
    
    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logEntry.innerHTML = `<div class="text-[10px] text-slate-500 font-mono mb-1.5">[${timeStr}] SYSTEM LOG</div><div>${logText}</div>`;
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;
}

// ============================================================================
// [5] 이미지 캡처 및 공유 기능 연동
// ============================================================================

// 캐릭터 캡처 다운로드 (글로벌 바인딩)
window.downloadProfile = function(charId) {
    const char = characters.find(c => c.id === charId);
    if(!char) return;

    document.getElementById('cap-name').textContent = char.name;
    document.getElementById('cap-type').textContent = char.typeDesc;
    
    const kwContainer = document.getElementById('cap-keywords');
    kwContainer.innerHTML = char.keywords.map(k => `<span class="bg-gray-100 text-gray-700 px-2.5 py-1 rounded shadow-sm text-[11px] font-bold border border-gray-200">${k.word}</span>`).join('');
    
    renderTraitBars(char.traits, 'cap-traits');
    
    setTimeout(() => {
        const el = document.getElementById('profile-card-capture');
        html2canvas(el, { 
            scale: 2, 
            backgroundColor: "#ffffff",
            scrollY: 0, // 스크롤 밀림 현상 방지
            onclone: (clonedDoc) => {
                // 캡처 화면에서만 자식 요소들을 위로 5px 이동시킴
                const clonedEl = clonedDoc.getElementById('profile-card-capture');
                // 텍스트 관련 태그 및 클래스를 가진 요소만 선택하여 5px 위로 이동
                const textElements = clonedEl.querySelectorAll(
                    'h2, h3, h4, span, div[class*="text-"]'
                );
                textElements.forEach(child => {
                    child.style.position = 'relative';
                    child.style.paddingBottom = '5px';
                    child.style.top = '-5px';
                });
            }
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${char.name}_시너지프로필.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }, 100);
};

window.shareProfileToX = function(charId) {
    const char = characters.find(c => c.id === charId);
    if(!char) return;
    const text = `${char.name}의 성향은 ${char.typeDesc}입니다!\n\n특성 키워드: ${char.keywords.map(k=>k.word).join(', ')}\n\n캐릭터를 만들고 관계성을 분석해보세요!\n#캐릭터_시너지_시뮬레이터\n`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(APP_URL)}`, '_blank');
};

function captureSynergy() {
    const el = document.getElementById('synergy-capture-area');
    html2canvas(el, { 
        scale: 1.5, 
        backgroundColor: "#f9fafb",
        scrollY: 0,
        onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById('synergy-capture-area');
            const textElements = clonedEl.querySelectorAll('h2, h3, h4, span, div[class*="text-"]');
            textElements.forEach(child => {
                child.style.position = 'relative';
                child.style.paddingBottom = '5px';
                child.style.top = '-5px';
            });
        }
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `시너지_분석결과.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}
function shareSynergyToX() {
    const selectedChars = selectedForSynergy.map(id => characters.find(c => c.id === id));
    let text = "";
    if(selectedChars.length === 2) {
        const score = calculateSimilarity(selectedChars[0], selectedChars[1]);
        text = `[${selectedChars[0].name}]와(과) [${selectedChars[1].name}]의 궁합은 ${score}%!\n\n캐릭터들의 관계성과 케미를 분석해보세요.\n#캐릭터_시너지_시뮬레이터\n`;
    } else {
        text = `${selectedChars.map(c=>c.name).join(', ')}의 그룹 시너지 분석 결과!\n과연 이들의 케미는 어떨까요?\n\n#캐릭터_시너지_시뮬레이터`;
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(APP_URL)}`, '_blank');
}

function exportJSON() {
    if (characters.length === 0) { alert('내보낼 캐릭터가 없습니다.'); return; }
    const blob = new Blob([JSON.stringify(characters, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `characters_${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                imported.forEach(impChar => {
                    const existIdx = characters.findIndex(c => c.id === impChar.id || c.name === impChar.name);
                    if (existIdx > -1) characters[existIdx] = impChar; 
                    else characters.push(impChar);
                });
                saveToLocal(); renderRoster();
                alert('캐릭터 데이터를 성공적으로 불러왔습니다.');
            }
        } catch (err) { alert('잘못된 JSON 파일 형식입니다.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function closeSynergyModal() { document.getElementById('synergy-modal').classList.add('hidden'); }

// ============================================================================
// [6] 이벤트 바인딩
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initData();
    renderKeywords();
    renderTraitBars({ext:0, agr:0, con:0, sta:0, ope:0, hon:0, dom:0}, 'traits-preview');

    document.getElementById('keyword-search').addEventListener('input', renderKeywords);
    document.getElementById('sort-type').addEventListener('change', renderKeywords);
    document.getElementById('char-name').addEventListener('input', updateUIState);
    document.getElementById('save-char-btn').addEventListener('click', saveCharacter);
    document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
    document.getElementById('delete-char-btn').addEventListener('click', deleteCharacter);
    document.getElementById('random-keyword-btn').addEventListener('click', randomSelectKeywords);
    document.getElementById('delete-selected-btn').addEventListener('click', deleteSelectedCharacters);
            
    document.getElementById('analyze-btn').addEventListener('click', analyzeSynergy);
    document.getElementById('roleplay-btn').addEventListener('click', openRoleplayModal); 

    document.getElementById('synergy-close-btn-1').addEventListener('click', closeSynergyModal);
    document.getElementById('synergy-close-btn-2').addEventListener('click', closeSynergyModal);
    document.getElementById('roleplay-close-btn').addEventListener('click', closeRoleplayModal);
    
    // 공유 및 저장 이벤트
    document.getElementById('synergy-capture-btn').addEventListener('click', captureSynergy);
    document.getElementById('synergy-tweet-btn').addEventListener('click', shareSynergyToX);

    document.getElementById('rp-clear-btn').addEventListener('click', clearRoleplayLog);
    document.getElementById('rp-continue-btn').addEventListener('click', continueRoleplay);

    document.getElementById('export-btn').addEventListener('click', exportJSON);
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', importJSON);
    
    document.getElementById('synergy-modal').addEventListener('click', function(e) { if (e.target === this) closeSynergyModal(); });
    document.getElementById('roleplay-modal').addEventListener('click', function(e) { if (e.target === this) closeRoleplayModal(); });
});
